import { randomUUID } from "node:crypto";
import { PROTOCOL_MODELS, type ProtocolProvider, type ProtocolTransport } from "./provider-protocol.ts";

/** Technical destination allowlist, not account/region/policy qualification. */
const ENDPOINTS: Readonly<Record<ProtocolProvider, readonly string[]>> = Object.freeze({
  qwen: Object.freeze(["https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"]),
  glm: Object.freeze(["https://open.bigmodel.cn/api/paas/v4/chat/completions"]),
  deepseek: Object.freeze(["https://api.deepseek.com/chat/completions", "https://api.deepseek.com/v1/chat/completions"]),
});
const MAX_BYTES = 262144;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type HttpProviderConfiguration = Readonly<{
  provider: ProtocolProvider;
  endpoint: string;
  configurationId: string;
  configurationVersion: number;
  timeoutMs: number;
}>;
export type DestinationReceipt = Readonly<{
  schemaVersion: "provider-destination/1";
  invocationId: string;
  provider: ProtocolProvider;
  model: string;
  endpoint: string;
  configurationId: string;
  configurationVersion: number;
  phase: "configured" | "attempted" | "response_buffered";
  observedAt: string;
}>;
export type HttpTransportDependencies = Readonly<{
  /** Server-owned secret supplier. This module never reads env, keychain or files. */
  credential: (signal: AbortSignal) => string | null | Promise<string | null>;
  /** Must persist only this closed metadata receipt. Preparation is not proof of dispatch. */
  recordDestination: (receipt: DestinationReceipt, signal: AbortSignal) => Promise<void>;
  /** Trusted network seam; omit for Node fetch. Injection is for controlled transport tests. */
  fetch?: typeof globalThis.fetch;
}>;

/**
 * Explicit server binding only; no public route, retries, fallback or enabled default.
 * Install only behind existing protocol policy + budget admission. It does not grant
 * permission or prove a supplier's physical region, legal recipient or account terms.
 */
export function createProviderHttpTransport(configuration: HttpProviderConfiguration, dependencies: HttpTransportDependencies): ProtocolTransport {
  if (typeof window !== "undefined" || !validConfiguration(configuration)
    || !record(dependencies) || typeof dependencies.credential !== "function" || typeof dependencies.recordDestination !== "function"
    || (dependencies.fetch !== undefined && typeof dependencies.fetch !== "function")) throw new Error("Provider transport configuration unavailable.");
  const config = Object.freeze({ ...configuration });
  const { credential, recordDestination } = dependencies;
  const fetcher = dependencies.fetch ?? globalThis.fetch;
  return async request => {
    if (!record(request) || request.provider !== config.provider || request.method !== "POST"
      || (request.endpoint !== undefined && request.endpoint !== config.endpoint)
      || typeof request.body !== "string" || Buffer.byteLength(request.body) > MAX_BYTES
      || !(request.signal instanceof AbortSignal) || request.signal.aborted) throw unavailable();
    const bodyText = request.body;
    try {
      const body: unknown = JSON.parse(bodyText);
      if (!record(body) || body.model !== PROTOCOL_MODELS[config.provider]) throw unavailable();
    } catch { throw unavailable(); }

    const controller = new AbortController();
    const abort = () => controller.abort();
    request.signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, config.timeoutMs);
    const invocationId = randomUUID();
    let networkResponse: Response | undefined;
    const cancelResponse = () => { void networkResponse?.body?.cancel().catch(() => {}); };
    controller.signal.addEventListener("abort", cancelResponse, { once: true });
    const receipt = (phase: DestinationReceipt["phase"]): DestinationReceipt => Object.freeze({
      schemaVersion: "provider-destination/1", invocationId, provider: config.provider,
      model: PROTOCOL_MODELS[config.provider], endpoint: config.endpoint,
      configurationId: config.configurationId, configurationVersion: config.configurationVersion,
      phase, observedAt: new Date().toISOString(),
    });
    let onAbort: () => void = () => {};
    const interrupted = new Promise<never>((_, reject) => {
      onAbort = () => reject(unavailable());
      controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    const check = () => { if (controller.signal.aborted) throw unavailable(); };
    try {
      const work = async () => {
        const secret = await credential(controller.signal);
        check();
        if (typeof secret !== "string" || !/^[\x21-\x7e]{1,4096}$/.test(secret)) throw unavailable();
        await recordDestination(receipt("configured"), controller.signal);
        check();
        const pending = fetcher(config.endpoint, {
          method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
          body: bodyText, signal: controller.signal, redirect: "manual", cache: "no-store", credentials: "omit",
        }).then(response => {
          networkResponse = response;
          if (controller.signal.aborted) cancelResponse();
          return response;
        }, () => null);
        // 'attempted' means fetch was invoked, not that the provider received or charged it.
        await recordDestination(receipt("attempted"), controller.signal);
        check();
        const response = await pending;
        if (!response) throw unavailable();
        // Never follow Location, return server error bodies, or preserve arbitrary headers.
        if (controller.signal.aborted || response.redirected || !response.ok || response.status !== 200
          || response.headers.get("content-type")?.split(";")[0].trim() !== "application/json" || !response.body) {
          void response.body?.cancel().catch(() => {});
          throw unavailable();
        }
        const bytes = await bufferResponse(response, controller.signal);
        check();
        await recordDestination(receipt("response_buffered"), controller.signal);
        check();
        return new Response(bytes, { status: 200, headers: { "content-type": "application/json" } });
      };
      return await Promise.race([work(), interrupted]);
    } catch {
      controller.abort();
      throw unavailable();
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener("abort", abort);
      controller.signal.removeEventListener("abort", onAbort);
      controller.signal.removeEventListener("abort", cancelResponse);
    }
  };
}

async function bufferResponse(response: Response, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const reader = response.body!.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (signal.aborted) throw unavailable();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { cancel(); throw unavailable(); }
      chunks.push(value);
    }
    return new Uint8Array(Buffer.concat(chunks));
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}
function validConfiguration(value: HttpProviderConfiguration): boolean {
  return record(value) && Object.keys(value).length === 5
    && Object.hasOwn(ENDPOINTS, value.provider) && ENDPOINTS[value.provider].includes(value.endpoint)
    && typeof value.configurationId === "string" && UUID.test(value.configurationId)
    && Number.isSafeInteger(value.configurationVersion) && value.configurationVersion > 0
    && Number.isSafeInteger(value.timeoutMs) && value.timeoutMs > 0 && value.timeoutMs <= 60000;
}
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function unavailable(): Error { return new Error("Provider transport unavailable."); }
