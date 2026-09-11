import { nativeRequestScope } from "../identity/native-request.ts";
import { isLocalNativeTarget } from "../identity/native-config.ts";
import { runTextWorker, type TextProviderBinding, type TextWorkerConfig } from "./text-worker.ts";
import { PROTOCOL_MODELS } from "../model-gateway/adapters/provider-protocol.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RPCS = new Set(["claim_text_task_work", "authorize_text_task_dispatch", "claim_text_work", "finish_turn_work", "read_text_work", "authorize_text_dispatch", "complete_text_work",
  "reserve_model_budget", "dispatch_model_budget", "finish_model_budget"]);
export type ScopedTextWorkerConfig = Readonly<{
  environment: "local" | "staging";
  databaseUrl: string;
  ownerId: string;
  policyId: string;
  budget: TextWorkerConfig;
}>;
export type ScopedTextWorkerDependencies = Readonly<{
  /** Existing server worker credential only; never an ordinary user or native proof client. */
  credential: (signal: AbortSignal) => string | null | Promise<string | null>;
  provider: TextProviderBinding;
  /** Controlled HTTP seam for tests; no caller/request can supply it. */
  fetch?: typeof globalThis.fetch;
}>;

/**
 * One owner/policy/budget-bound poll. No public route, timer or environment-secret
 * lookup. The deployment must supply reviewed pricing, recipient and credentials.
 * SQL checks remain authoritative; this binding cannot activate a policy or scope.
 */
export function createScopedTextWorker(config: ScopedTextWorkerConfig, dependencies: ScopedTextWorkerDependencies) {
  if (typeof window !== "undefined" || !valid(config) || typeof dependencies?.credential !== "function"
    || !dependencies.provider || !Object.hasOwn(PROTOCOL_MODELS, dependencies.provider.provider)
    || (dependencies.provider.inputMode !== undefined && !["current_input_v1", "task_history_v1"].includes(dependencies.provider.inputMode))
    || typeof dependencies.provider.endpoint !== "string" || !/^https:\/\/[^/?#@]+\/[^?#]*$/.test(dependencies.provider.endpoint)
    || typeof dependencies.provider.price !== "function" || typeof dependencies.provider.transport !== "function"
    || (dependencies.fetch !== undefined && typeof dependencies.fetch !== "function")) throw unavailable();
  const binding = Object.freeze({ ...config, budget: Object.freeze({ ...config.budget }) });
  const provider = Object.freeze({ ...dependencies.provider });
  const credential = dependencies.credential, fetcher = dependencies.fetch ?? globalThis.fetch;

  return async (signal: AbortSignal): Promise<"empty" | "finished" | "queued" | "unavailable"> => {
    // Deployed Next environments cannot accidentally turn a local worker into a
    // server entry. A dedicated trusted process owns the Staging invocation.
    if (process.env.VERCEL_ENV || signal.aborted) return "unavailable";
    const rpc = async (name: string, parameters: Readonly<Record<string, string | number | null>>) => {
      if (!RPCS.has(name)) throw unavailable();
      const scope = nativeRequestScope(signal);
      try {
        const secret = await scope.run(() => Promise.resolve(credential(scope.signal)));
        if (typeof secret !== "string" || !/^[\x21-\x7e]{1,8192}$/.test(secret)) throw unavailable();
        const response = await scope.run(() => fetcher(binding.databaseUrl + "/rest/v1/rpc/" + name, {
          method: "POST", headers: { "content-type": "application/json", apikey: secret, authorization: "Bearer " + secret },
          body: JSON.stringify(parameters), redirect: "manual", credentials: "omit", cache: "no-store", signal: scope.signal,
        }).then(value => {
          if (scope.signal.aborted) { try { void value.body?.cancel().catch(() => {}); } catch { /* late body */ } }
          return value;
        }));
        if (response.redirected || response.status !== 200 || response.headers.get("content-type")?.split(";")[0].trim() !== "application/json" || !response.body) {
          try { void response.body?.cancel().catch(() => {}); } catch { /* bounded failure */ }
          throw unavailable();
        }
        const reader = response.body.getReader(), chunks: Uint8Array[] = [];
        let size = 0;
        try {
          for (;;) {
            const part = await scope.run(() => reader.read());
            if (part.done) break;
            size += part.value.byteLength;
            if (size > 262144) throw unavailable();
            chunks.push(part.value);
          }
          scope.check();
          return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))) as unknown;
        } finally {
          try { void reader.cancel().catch(() => {}); } catch { /* reader already closed */ }
          try { reader.releaseLock(); } catch { /* pending hostile read */ }
        }
      } catch { throw unavailable(); }
      finally { scope.dispose(); }
    };
    return runTextWorker(async (name, params) => {
      if (name !== "claim_turn_work") return rpc(name, params);
      const value = await rpc(provider.inputMode === "task_history_v1" ? "claim_text_task_work" : "claim_text_work", { p_owner_id: binding.ownerId, p_policy_id: binding.policyId });
      if (record(value) && value.kind === "leased" && value.ownerId !== binding.ownerId) throw unavailable();
      return value;
    }, async (name, params) => {
      if (["authorize_text_dispatch", "authorize_text_task_dispatch"].includes(name) && params.p_policy_id !== binding.policyId) throw unavailable();
      const value = await rpc(name, params);
      if (name === "read_text_work" && record(value) && ["input", "task_input"].includes(String(value.kind)) && value.policyId !== binding.policyId) throw unavailable();
      return value;
    }, async (name, params) => {
      if (params.p_owner_id !== binding.ownerId || params.p_scope_id !== binding.budget.scopeId) throw unavailable();
      return rpc(name, params);
    }, binding.budget, provider, signal);
  };
}

function valid(value: ScopedTextWorkerConfig): boolean {
  if (!record(value) || Object.keys(value).length !== 5 || !record(value.budget) || Object.keys(value.budget).length !== 5
    || ![value.ownerId, value.policyId, value.budget.scopeId].every(id => typeof id === "string" && UUID.test(id))
    || typeof value.budget.priceVersion !== "string" || !/^[A-Za-z0-9._-]{1,100}$/.test(value.budget.priceVersion)
    || !Number.isSafeInteger(value.budget.reservedMicros) || value.budget.reservedMicros < 1 || value.budget.reservedMicros > 1_000_000_000_000
    || !Number.isSafeInteger(value.budget.maxOutputTokens) || value.budget.maxOutputTokens < 1 || value.budget.maxOutputTokens > 4096
    || !Number.isSafeInteger(value.budget.timeoutMs) || value.budget.timeoutMs < 1 || value.budget.timeoutMs > 60000) return false;
  return value.environment === "staging" ? value.databaseUrl === "https://dzqdzetcctkhbrhlxxgn.supabase.co"
    : value.environment === "local" && typeof value.databaseUrl === "string" && isLocalNativeTarget(value.databaseUrl) && !value.databaseUrl.endsWith("/");
}
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function unavailable(): Error { return new Error("Scoped text worker unavailable."); }
