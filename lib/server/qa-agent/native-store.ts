import { verifyNativeCredentials } from "../identity/native-credentials.ts";
import { nativeRequestScope } from "../identity/native-request.ts";
import { QaError } from "./contract.ts";
import { exact, record, rpcError, uuid, type QaStore, type Thread } from "./service.ts";

type Scope = ReturnType<typeof nativeRequestScope>;
const operations = new Set(["qa_read_policy_v1", "qa_accept_policy_v1", "qa_list_sessions_v1", "qa_read_session_v1",
  "qa_submit_message_v1", "read_text_turn", "qa_cancellation_v1"]);
function thread(value: unknown): Thread {
  if (!record(value) || !exact(value, ["id", "status", "createdAt", "updatedAt"]) || !uuid(value.id)
    || typeof value.status !== "string" || !value.status
    || ![value.createdAt, value.updatedAt].every(v => typeof v === "string" && Number.isFinite(Date.parse(v)))) throw new QaError("PROVIDER_UNAVAILABLE");
  return value as Thread;
}
/** Bounded SDK transport, retaining the original request scope/redirect refusal. */
function boundedFetch(scope: Scope): typeof fetch {
  return async (input, init) => {
    const response = await scope.fetch(input, init);
    if (!response.body) return response;
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
    try {
      for (;;) {
        const next = await scope.run(() => reader.read()); if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > 262144) throw new QaError("PROVIDER_UNAVAILABLE");
        chunks.push(next.value);
      }
      scope.check();
      const headers = new Headers(response.headers); headers.delete("content-length"); headers.delete("content-encoding");
      return new Response(Buffer.concat(chunks), { status: response.status, statusText: response.statusText, headers });
    } finally { void reader.cancel().catch(() => {}); try { reader.releaseLock(); } catch { /* pending abort */ } }
  };
}

/** JWT verification is preparation only. Every data operation also acquires and
 * validates the same original mobile epoch inside qa_native_session_v1. */
export async function prepareNativeQaStore(request: Pick<Request, "headers">,
  config: Readonly<{ url: string; publishableKey: string }>, scope: Scope) {
  const credentials = await scope.run(() => verifyNativeCredentials(request, config, boundedFetch(scope), scope.unavailable));
  if (!credentials) throw new QaError("UNAUTHENTICATED");
  const session = await scope.run(() => credentials.client.rpc("native_session_v2", { p_action: "session" }).abortSignal(scope.signal));
  if (session.error) throw rpcError(session.error.message);
  const actor = session.data;
  if (!record(actor) || !exact(actor, ["version", "subject", "sessionId", "mobileEpoch"]) || actor.version !== 2
    || !uuid(actor.subject) || !uuid(actor.sessionId) || !Number.isSafeInteger(actor.mobileEpoch) || Number(actor.mobileEpoch) < 1) throw new QaError("PROVIDER_UNAVAILABLE");
  if (actor.subject !== credentials.subject || actor.sessionId !== credentials.sessionId) throw new QaError("UNAUTHENTICATED");
  const mobileEpoch = Number(actor.mobileEpoch);
  const call = async (action: string, payload: Record<string, unknown>) => {
    scope.check();
    return scope.run(() => credentials.client.rpc("qa_native_session_v1", {
      p_action: action, p_mobile_epoch: mobileEpoch, p_payload: payload,
    }).abortSignal(scope.signal));
  };
  const data = async (action: string, payload: Record<string, unknown>) => {
    const result = await call(action, payload);
    if (result.error) throw rpcError(result.error.message);
    if (!record(result.data)) throw new QaError("PROVIDER_UNAVAILABLE");
    if (["blocked", "unavailable"].includes(String(result.data.kind))) throw new QaError("DATA_POLICY_BLOCKED");
    return result.data;
  };
  const rpc: QaStore["rpc"] = async (name, params) => {
    if (!operations.has(name)) throw new QaError("INVALID_INPUT");
    const result = await call(name, params);
    return { data: result.data, error: result.error ? { message: result.error.message } : null };
  };
  const store: QaStore = {
    rpc,
    list: async () => {
      const value = await data("list", {});
      if (value.kind !== "threads" || !exact(value, ["kind", "threads"]) || !Array.isArray(value.threads) || value.threads.length > 20) throw new QaError("PROVIDER_UNAVAILABLE");
      const rows = value.threads.map(thread);
      if (new Set(rows.map(t => t.id)).size !== rows.length) throw new QaError("PROVIDER_UNAVAILABLE");
      return rows;
    },
    create: async () => {
      const value = await data("create", {});
      if (value.kind !== "thread" || !exact(value, ["kind", "thread"])) throw new QaError("PROVIDER_UNAVAILABLE");
      return thread(value.thread);
    },
    read: async id => {
      const value = await data("read", { p_thread_id: id });
      if (value.kind !== "thread_read" || !exact(value, ["kind", "thread", "turns"]) || !Array.isArray(value.turns) || value.turns.length > 8) throw new QaError("PROVIDER_UNAVAILABLE");
      const current = thread(value.thread); if (current.id !== id) throw new QaError("FORBIDDEN");
      const turns = value.turns.map((v: unknown) => {
        if (!record(v) || !exact(v, ["id", "status", "createdAt"]) || !uuid(v.id) || typeof v.status !== "string"
          || typeof v.createdAt !== "string" || !Number.isFinite(Date.parse(v.createdAt))) throw new QaError("PROVIDER_UNAVAILABLE");
        return { id: v.id, status: v.status, createdAt: v.createdAt };
      });
      if (new Set(turns.map(t => t.id)).size !== turns.length) throw new QaError("PROVIDER_UNAVAILABLE");
      return { thread: current, turns };
    },
  };
  return store;
}
