import { createHash } from "node:crypto";
import { isFailureCode, FAILURE_TAXONOMY, type FailureCode } from "../../../lib/server/contracts/errors/index.ts";
import { record, type RuntimeContext } from "./contract.ts";

export type RuntimeRequest = Readonly<{
  name: "native_session_v2" | "read_assistant_events_v1" | "cancel_chat_turn" | "read_local_recovery_operation_v1" | "read_trip_confirmation_receipt_v1" | "read_trip_proposal_v2" | "confirm_and_apply_trip_proposal" | "trip_reload";
  params: Readonly<Record<string, unknown>>;
  context: RuntimeContext;
}>;
/** Supplied by the existing authenticated ordinary-user transport. No default fetch or credentials.
 * RPC requests carry existing PostgREST parameter names; trip_reload is the existing Native v2 GET.
 * Cancellation/confirmation must use the current production authorization path, never a service JWT. */
export type RuntimeTransport = (request: RuntimeRequest, signal: AbortSignal) => Promise<Response>;
export type Observation = Readonly<{ request: RuntimeRequest["name"]; status: number | null; bytes: number; sha256: string | null; code: FailureCode | null }>;
export class RuntimeFailure extends Error {
  readonly code: FailureCode;
  constructor(code: FailureCode) { super(code); this.code = code; }
}

/** Concrete bridge to existing endpoints. Fetches must already enforce the caller's
 * current ordinary-user credentials, target allowlist and Native session binding.
 * Redirects/retries are forbidden here; no credential/configuration is discovered. */
export function createNativeRecoveryTransport(options: Readonly<{
  databaseOrigin: string; appOrigin: string;
  rpcFetch: typeof fetch; nativeFetch: typeof fetch;
}>): RuntimeTransport {
  const origin = (value: string) => {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.origin !== value || url.username || url.password) throw new RuntimeFailure("INVALID_INPUT");
    return value;
  };
  const database = origin(options.databaseOrigin), app = origin(options.appOrigin);
  return async (request, signal) => {
    if (signal.aborted) throw new RuntimeFailure("CANCELLED");
    if (request.name === "trip_reload") {
      return options.nativeFetch(`${app}/api/trips/native/v2/${request.context.tripId}`, { method: "GET", signal, redirect: "error", cache: "no-store" });
    }
    return options.rpcFetch(`${database}/rest/v1/rpc/${request.name}`, {
      method: "POST", body: JSON.stringify(request.params), headers: { "Content-Type": "application/json" },
      signal, redirect: "error", cache: "no-store",
    });
  };
}

export function createBoundedPort(transport: RuntimeTransport, context: RuntimeContext, maxRequests: number, signal: AbortSignal) {
  const observations: Observation[] = [];
  let requests = 0;
  let totalBytes = 0;
  const call = async (name: RuntimeRequest["name"], params: Readonly<Record<string, unknown>>) => {
    if (signal.aborted) throw new RuntimeFailure("CANCELLED");
    if (++requests > maxRequests) throw new RuntimeFailure("RATE_LIMITED");
    const request = Object.freeze({ name, params: Object.freeze(structuredClone(params)), context });
    if (Buffer.byteLength(JSON.stringify(request)) > 8192) throw new RuntimeFailure("INVALID_INPUT");
    let status: number | null = null, bytes = 0, digest: string | null = null;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let abort = () => {};
    const interrupted = new Promise<never>((_, reject) => {
      abort = () => reject(new RuntimeFailure("CANCELLED"));
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
    try {
      const pending = Promise.resolve().then(() => {
        if (signal.aborted) throw new RuntimeFailure("CANCELLED");
        return transport(request, signal);
      }).then(response => {
        if (signal.aborted) { void response.body?.cancel().catch(() => {}); throw new RuntimeFailure("CANCELLED"); }
        return response;
      });
      const response = await Promise.race([pending, interrupted]);
      status = response.status;
      const size = response.headers.get("content-length");
      if (size !== null && (!/^\d+$/.test(size) || Number(size) > 262144)) {
        void response.body?.cancel().catch(() => {});
        throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
      }
      if (response.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
        void response.body?.cancel().catch(() => {});
        throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
      }
      reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      if (reader) for (;;) {
        const chunk = await Promise.race([reader.read(), interrupted]);
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        totalBytes += chunk.value.byteLength;
        if (bytes > 262144 || totalBytes > 1048576) throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
        chunks.push(chunk.value);
      }
      if (signal.aborted) throw new RuntimeFailure("CANCELLED");
      const body = Buffer.concat(chunks);
      digest = createHash("sha256").update(body).digest("hex");
      let data: unknown;
      try { data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)); }
      catch { throw new RuntimeFailure("MODEL_OUTPUT_INVALID"); }
      if (!response.ok) {
        const error = record(data) && record(data.error) ? data.error.code : null;
        // Direct PostgREST errors differ from Native failure envelopes. Map only
        // the closed production tokens; never return/log arbitrary SQL detail.
        const rpcCodes: Readonly<Record<string, FailureCode>> = {
          UNAUTHENTICATED: "UNAUTHENTICATED", SESSION_REPLACED: "UNAUTHENTICATED", FORBIDDEN: "FORBIDDEN",
          INVALID_INPUT: "INVALID_INPUT", IDEMPOTENCY_KEY_REUSE: "IDEMPOTENCY_KEY_REUSE", CONFIRMATION_DIGEST_MISMATCH: "INVALID_INPUT",
          SERVICE_TASK_CONFLICT: "SERVICE_TASK_CONFLICT", SERVICE_TASK_CAPACITY_EXHAUSTED: "SERVICE_TASK_CAPACITY_EXHAUSTED",
          DATA_POLICY_BLOCKED: "DATA_POLICY_BLOCKED", RECOVERY_CONFLICT: "STALE_TRIP_VERSION", RECOVERY_STALE: "STALE_TRIP_VERSION",
        };
        const rpcCode = name !== "trip_reload" && record(data) && typeof data.message === "string"
          && [400, 401, 403, 409].includes(status) && Object.hasOwn(rpcCodes, data.message) ? rpcCodes[data.message] : undefined;
        const code = isFailureCode(error) && FAILURE_TAXONOMY[error].httpStatus === status ? error : rpcCode ?? "PROVIDER_UNAVAILABLE";
        throw new RuntimeFailure(code);
      }
      observations.push(Object.freeze({ request: name, status, bytes, sha256: digest, code: null }));
      return data;
    } catch (error) {
      const code = error instanceof RuntimeFailure ? error.code : "PROVIDER_UNAVAILABLE";
      observations.push(Object.freeze({ request: name, status, bytes, sha256: digest, code }));
      throw new RuntimeFailure(code);
    } finally {
      signal.removeEventListener("abort", abort);
      if (reader) { void reader.cancel().catch(() => {}); try { reader.releaseLock(); } catch { /* pending read */ } }
    }
  };
  return { call, observations };
}
