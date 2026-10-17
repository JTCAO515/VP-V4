import { createHash } from "node:crypto";
import { isFailureCode, FAILURE_TAXONOMY, type FailureCode } from "../../../lib/server/contracts/errors/index.ts";
import { record, ownExact, type RuntimeContext } from "./contract.ts";
import { uuid, hash, integer } from "../../../lib/server/today/recovery/contract.ts";

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
  if (!record(options) || !ownExact(options, ["databaseOrigin", "appOrigin", "rpcFetch", "nativeFetch"])
    || typeof options.databaseOrigin !== "string" || typeof options.appOrigin !== "string"
    || typeof options.rpcFetch !== "function" || typeof options.nativeFetch !== "function") throw new RuntimeFailure("INVALID_INPUT");
  const origin = (value: string) => {
    let url: URL;
    try { url = new URL(value); } catch { throw new RuntimeFailure("INVALID_INPUT"); }
    if (url.protocol !== "https:" || url.origin !== value || url.username || url.password) throw new RuntimeFailure("INVALID_INPUT");
    return value;
  };
  const database = origin(options.databaseOrigin), app = origin(options.appOrigin);
  const rpcFetch = options.rpcFetch, nativeFetch = options.nativeFetch;
  return async (request, signal) => {
    if (signal.aborted) throw new RuntimeFailure("CANCELLED");
    const keys: Readonly<Record<RuntimeRequest["name"], readonly string[]>> = {
      native_session_v2: ["p_action"], read_assistant_events_v1: ["p_policy_id", "p_conversation_id", "p_after_sequence", "p_limit"],
      cancel_chat_turn: ["p_turn_id"], read_local_recovery_operation_v1: ["p_trip_id", "p_operation_id"],
      read_trip_confirmation_receipt_v1: ["p_proposal_id"], read_trip_proposal_v2: ["p_proposal_id"],
      confirm_and_apply_trip_proposal: ["p_proposal_id", "p_idempotency_key", "p_digest"], trip_reload: ["tripId"],
    };
    if (!record(request) || !ownExact(request, ["name", "params", "context"]) || !Object.hasOwn(keys, request.name)
      || !record(request.params) || !ownExact(request.params, keys[request.name]) || !record(request.context)
      || !ownExact(request.context, ["ownerId", "sessionId", "mobileEpoch", "taskId", "turnId", "conversationId", "policyId", "tripId", "source"])
      || ![request.context.ownerId, request.context.sessionId, request.context.taskId, request.context.turnId, request.context.conversationId,
        request.context.policyId, request.context.tripId].every(uuid) || request.context.taskId === request.context.turnId || !integer(request.context.mobileEpoch, 1)
      || !record(request.context.source) || !ownExact(request.context.source, ["apiSha", "workerSha", "configurationDigest"])
      || ![request.context.source.apiSha, request.context.source.workerSha].every(v => typeof v === "string" && /^[0-9a-f]{40}$/.test(v))
      || !hash(request.context.source.configurationDigest)) throw new RuntimeFailure("INVALID_INPUT");
    if (request.name === "trip_reload") {
      if (request.params.tripId !== request.context.tripId) throw new RuntimeFailure("INVALID_INPUT");
      return nativeFetch(`${app}/api/trips/native/v2/${request.context.tripId}`, { method: "GET", signal, redirect: "error", cache: "no-store" });
    }
    return rpcFetch(`${database}/rest/v1/rpc/${request.name}`, {
      method: "POST", body: JSON.stringify(request.params), headers: { "Content-Type": "application/json" },
      signal, redirect: "error", cache: "no-store",
    });
  };
}

export function createBoundedPort(transport: RuntimeTransport, context: RuntimeContext, maxRequests: number, signal: AbortSignal, deadline: number) {
  const observations: Observation[] = [];
  let requests = 0;
  let totalBytes = 0;
  const check = (bytes = 0) => {
    if (performance.now() >= deadline) throw new RuntimeFailure(bytes > 0 ? "TIMEOUT_AFTER_OUTPUT" : "TIMEOUT_BEFORE_OUTPUT");
    if (signal.aborted) throw new RuntimeFailure("CANCELLED");
  };
  const call = async (name: RuntimeRequest["name"], params: Readonly<Record<string, unknown>>) => {
    check();
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
        check();
        return transport(request, signal);
      }).then(response => {
        try { check(); } catch (error) { void response.body?.cancel().catch(() => {}); throw error; }
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
      let reads = 0, emptyReads = 0;
      if (reader) for (;;) {
        check(bytes);
        if (++reads > 4096) throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
        const chunk = await Promise.race([reader.read(), interrupted]);
        check(bytes);
        if (chunk.done) break;
        if (!(chunk.value instanceof Uint8Array)) throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
        if (chunk.value.byteLength === 0) {
          if (++emptyReads > 64) throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
          continue;
        }
        bytes += chunk.value.byteLength;
        totalBytes += chunk.value.byteLength;
        if (bytes > 262144 || totalBytes > 1048576) throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
        chunks.push(chunk.value);
      }
      check(bytes);
      const body = Buffer.concat(chunks);
      digest = createHash("sha256").update(body).digest("hex");
      let data: unknown;
      try { data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)); }
      catch { throw new RuntimeFailure("MODEL_OUTPUT_INVALID"); }
      check(bytes);
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
