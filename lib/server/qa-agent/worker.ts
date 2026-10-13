import { createProviderHttpTransport, type HttpProviderConfiguration, type HttpTransportDependencies } from "../model-gateway/adapters/http-transport.ts";
import { createTextJobPrice, type TextJobPricing } from "../jobs/staging-text-job.ts";
import { supabaseWorkerHeaders } from "../jobs/supabase-worker-headers.ts";
import { nativeRequestScope } from "../identity/native-request.ts";
import type { TextWorkerConfig } from "../turn/text-worker.ts";
import { executeQaWork, type QaExecutorDependencies, type QaWorkerRpc } from "./executor.ts";
import { record, uuid } from "./service.ts";

export type QaWorkerConfiguration = Readonly<{
  schemaVersion: "qa-agent-worker/1"; databaseUrl: string; ownerId: string; policyId: string;
  budget: TextWorkerConfig; provider: HttpProviderConfiguration; pricing: TextJobPricing;
}>;
export type QaWorkerDependencies = Readonly<{
  workerCredential: HttpTransportDependencies["credential"];
  providerCredential: HttpTransportDependencies["credential"];
  recordDestination: HttpTransportDependencies["recordDestination"];
  recordUsage: QaExecutorDependencies["recordUsage"];
  invokeContext: QaExecutorDependencies["invokeContext"];
  qwenEndpoint?: string;
  fetch?: typeof fetch;
}>;
const RPCS = new Set(["qa_claim_work_v1", "qa_read_work_v1", "qa_authorize_dispatch_v1", "qa_complete_work_v1", "reserve_model_budget", "finish_model_budget"]);

/** Callable adapter for the existing trusted worker host; no daemon, timer,
 * user-selectable model, environment secret lookup or second queue is created.
 * The deployment supplies existing secure credentials and reviewed tariff.
 */
export function createQaWorker(configuration: QaWorkerConfiguration, dependencies: QaWorkerDependencies) {
  if (typeof window !== "undefined" || process.env.VERCEL_ENV || configuration.schemaVersion !== "qa-agent-worker/1" || !uuid(configuration.ownerId) || !uuid(configuration.policyId)
    || !uuid(configuration.budget.scopeId) || configuration.provider.timeoutMs !== configuration.budget.timeoutMs
    || typeof dependencies.workerCredential !== "function" || typeof dependencies.providerCredential !== "function"
    || typeof dependencies.recordDestination !== "function" || typeof dependencies.recordUsage !== "function" || typeof dependencies.invokeContext !== "function") throw unavailable();
  let database: URL;
  try { database = new URL(configuration.databaseUrl); } catch { throw unavailable(); }
  const local = !process.env.VERCEL_ENV && database.protocol === "http:" && ["localhost", "127.0.0.1"].includes(database.hostname);
  if ((!local && database.origin !== "https://dzqdzetcctkhbrhlxxgn.supabase.co") || database.username || database.password || database.search || database.hash || database.pathname !== "/") throw unavailable();
  const config = Object.freeze({ ...configuration, databaseUrl: database.origin, budget: Object.freeze({ ...configuration.budget }),
    provider: Object.freeze({ ...configuration.provider }), pricing: Object.freeze({ ...configuration.pricing }) });
  const price = createTextJobPrice(config.pricing);
  // Full existing maximum model context reservation is deliberately conservative;
  // no text length estimate, guessed token usage or assumed free retries.
  const worst = (BigInt(1_048_576) * BigInt(Math.max(config.pricing.inputMicrosPerMillion, config.pricing.cachedInputMicrosPerMillion ?? 0))
    + BigInt(config.budget.maxOutputTokens) * BigInt(config.pricing.outputMicrosPerMillion) + BigInt(999999)) / BigInt(1000000);
  if (!Number.isSafeInteger(config.budget.reservedMicros) || config.budget.reservedMicros < 1 || BigInt(config.budget.reservedMicros) < worst) throw unavailable();
  const transport = createProviderHttpTransport(config.provider, { credential: dependencies.providerCredential,
    recordDestination: dependencies.recordDestination, qwenEndpoint: dependencies.qwenEndpoint, ...(dependencies.fetch ? { fetch: dependencies.fetch } : {}) });
  const fetcher = dependencies.fetch ?? globalThis.fetch;
  const rpc: QaWorkerRpc = async (name, params, signal) => {
    if (!RPCS.has(name) || signal.aborted) throw unavailable();
    if (name === "qa_claim_work_v1" && (params.p_owner_id !== config.ownerId || params.p_policy_id !== config.policyId)) throw unavailable();
    if (["reserve_model_budget", "finish_model_budget"].includes(name) && (params.p_owner_id !== config.ownerId || params.p_scope_id !== config.budget.scopeId)) throw unavailable();
    if (name === "qa_authorize_dispatch_v1" && (params.p_scope_id !== config.budget.scopeId || params.p_policy_id !== config.policyId || params.p_provider !== config.provider.provider)) throw unavailable();
    const lifetime = nativeRequestScope(signal, 8000);
    try {
      const credential = await lifetime.run(() => Promise.resolve(dependencies.workerCredential(lifetime.signal)));
      if (!credential) throw unavailable();
      const result = await lifetime.run(() => fetcher(config.databaseUrl + "/rest/v1/rpc/" + name, { method: "POST",
        headers: supabaseWorkerHeaders(credential), body: JSON.stringify(params), redirect: "manual", cache: "no-store", credentials: "omit", signal: lifetime.signal }));
      if (result.redirected || result.status !== 200 || result.headers.get("content-type")?.split(";")[0].trim() !== "application/json" || !result.body) {
        void result.body?.cancel().catch(() => {}); throw unavailable();
      }
      const reader = result.body.getReader(), parts: Uint8Array[] = []; let size = 0;
      try {
        for (;;) {
          const part = await lifetime.run(() => reader.read()); if (part.done) break;
          size += part.value.byteLength; if (size > 262144) throw unavailable(); parts.push(part.value);
        }
        lifetime.check();
        const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts)));
        if (!record(value)) throw unavailable();
        return value;
      } finally { void reader.cancel().catch(() => {}); try { reader.releaseLock(); } catch { /* pending read */ } }
    } finally { lifetime.dispose(); }
  };
  return (signal: AbortSignal) => executeQaWork(config.ownerId, config.policyId, config.budget, { rpc,
    provider: { provider: config.provider.provider, endpoint: config.provider.endpoint, transport, price },
    invokeContext: dependencies.invokeContext, recordUsage: dependencies.recordUsage }, signal);
}
function unavailable() { return new Error("QA worker configuration unavailable"); }
