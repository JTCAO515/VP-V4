import { getNativeTextConfig } from "../../turn/native-http.ts";
import { verifyNativeCredentials } from "../../identity/native-credentials.ts";
import { nativeRequestScope } from "../../identity/native-request.ts";
import { FAILURE_TAXONOMY, type FailureCode } from "../../contracts/errors/index.ts";
import { record } from "./contract.ts";
import { canonicalUuid, parseTranslationRecoveryIdentity, projectTranslationRecovery, unknownTranslationRecovery } from "./recovery-contract.ts";

export const TRANSLATION_RECOVERY_MAX_BYTES = 64_000;
export const TRANSLATION_RECOVERY_UPSTREAM_MAX_BYTES = 2_000_000;
function reply(value: unknown, status = 200): Response {
  const wire = JSON.stringify(value);
  if (Buffer.byteLength(wire, "utf8") > TRANSLATION_RECOVERY_MAX_BYTES) return failure("PROVIDER_UNAVAILABLE");
  return new Response(wire, { status, headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } });
}
const failure = (code: FailureCode) => reply({ error: { code } }, FAILURE_TAXONOMY[code].httpStatus);
class RecoveryFailure extends Error {
  readonly code: FailureCode;
  constructor(code: FailureCode) { super(code); this.code = code; }
}
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
function upstreamError(message: string): never {
  const code = /UNAUTHENTICATED|SESSION_REPLACED/.test(message) ? "UNAUTHENTICATED"
    : message.includes("DATA_POLICY_BLOCKED") ? "DATA_POLICY_BLOCKED"
    : message.includes("FORBIDDEN") || message.includes("permission denied") ? "FORBIDDEN" : "PROVIDER_UNAVAILABLE";
  throw new RecoveryFailure(code);
}
function oneRow(data: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!Array.isArray(data) || data.length > 1 || (data.length === 1 && (!record(data[0]) || !exact(data[0], keys)))) throw new RecoveryFailure("PROVIDER_UNAVAILABLE");
  return data[0] ?? null;
}

/** GET-only recovery. Existing read RPCs use POST transport; none admit or generate a Turn. */
export async function translationRecoveryHTTP(request: Request, turnId: string): Promise<Response> {
  if (process.env.VERCEL_ENV === "production") return failure("PROVIDER_UNAVAILABLE");
  if (request.method !== "GET" || request.headers.has("cookie") || request.headers.has("origin") || request.url.length > 2000) return failure("INVALID_INPUT");
  const identity = parseTranslationRecoveryIdentity(turnId, new URL(request.url).searchParams);
  if (!identity) return failure("INVALID_INPUT");
  const config = getNativeTextConfig(request);
  if (!config) return failure("PROVIDER_UNAVAILABLE");
  if (config.policyId !== identity.policyId) return failure("DATA_POLICY_BLOCKED");
  const scope = nativeRequestScope(request.signal);
  // The SDK buffers REST bodies before parsing. Bound every upstream response,
  // including Auth/JWKS and unrelated candidates in the policy-scoped window.
  const transport: typeof fetch = async (input, init) => {
    const response = await scope.fetch(input, init), reader = response.body?.getReader();
    const chunks: Uint8Array[] = []; let bytes = 0;
    try {
      if (Number(response.headers.get("content-length")) > TRANSLATION_RECOVERY_UPSTREAM_MAX_BYTES) throw new Error("oversized");
      if (reader) for (;;) {
        const next = await scope.run(() => reader.read());
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > TRANSLATION_RECOVERY_UPSTREAM_MAX_BYTES) throw new Error("oversized");
        chunks.push(next.value);
      }
      scope.check();
      const headers = new Headers(response.headers); headers.delete("content-length");
      return new Response(reader ? Buffer.concat(chunks) : null, { status: response.status, statusText: response.statusText, headers });
    } catch (error) { scope.unavailable(); throw error; }
    finally { try { void reader?.cancel().catch(() => {}); } catch { /* already closed */ } }
  };
  try {
    const actor = await scope.run(() => verifyNativeCredentials(request, config, transport, scope.unavailable));
    if (!actor) return failure("UNAUTHENTICATED");
    const rpc = async (name: string, params: Record<string, string | number>) => {
      const result = await scope.run(() => actor.client.rpc(name, params).abortSignal(scope.signal));
      if (result.error) upstreamError(result.error.message);
      return result.data as unknown;
    };
    const session = async () => {
      const data = await rpc("native_session_v2", { p_action: "session" });
      if (!record(data) || !canonicalUuid(data.subject) || !canonicalUuid(data.sessionId)) throw new RecoveryFailure("PROVIDER_UNAVAILABLE");
      if (data.subject !== actor.subject || data.sessionId !== actor.sessionId) throw new RecoveryFailure("UNAUTHENTICATED");
    };
    const policy = async () => {
      const data = await rpc("read_text_policy", { p_policy_id: config.policyId });
      if (record(data) && ["blocked", "unavailable"].includes(String(data.kind))) throw new RecoveryFailure("DATA_POLICY_BLOCKED");
      if (!record(data) || data.kind !== "policy" || !record(data.policy)) throw new RecoveryFailure("PROVIDER_UNAVAILABLE");
      const p = data.policy;
      if (!canonicalUuid(p.id) || typeof p.noticeHash !== "string" || !/^[a-f0-9]{64}$/.test(p.noticeHash)
        || !["accepted", "withdrawn", "not_accepted"].includes(String(p.consentState))) throw new RecoveryFailure("PROVIDER_UNAVAILABLE");
      if (p.id !== identity.policyId || p.noticeHash !== identity.noticeHash || p.consentState !== "accepted") throw new RecoveryFailure("DATA_POLICY_BLOCKED");
    };
    const snapshot = async () => {
      const select = async (table: "chat_threads" | "turns" | "chat_turn_idempotency", columns: string, filters: Record<string, string>) => {
        let query = actor.client.from(table).select(columns).eq("owner_id", actor.subject);
        for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
        const result = await scope.run(() => query.limit(2).abortSignal(scope.signal));
        if (result.error) upstreamError(result.error.message);
        return oneRow(result.data, columns.split(","));
      };
      const thread = await select("chat_threads", "id,owner_id,status", { id: identity.threadId });
      const turn = await select("turns", "id,owner_id,thread_id,status", { id: identity.turnId, thread_id: identity.threadId });
      const key = await select("chat_turn_idempotency", "owner_id,thread_id,turn_id,idempotency_key", { thread_id: identity.threadId, turn_id: identity.turnId, idempotency_key: identity.idempotencyKey });
      if (!thread || !turn || !key) return null;
      if (thread.id !== identity.threadId || thread.owner_id !== actor.subject || thread.status !== "active"
        || turn.id !== identity.turnId || turn.owner_id !== actor.subject || turn.thread_id !== identity.threadId
        || key.owner_id !== actor.subject || key.thread_id !== identity.threadId || key.turn_id !== identity.turnId || key.idempotency_key !== identity.idempotencyKey) return null;
      // This is the only existing reader that proves the stored policy binding.
      // A missing Turn may simply be outside the window; never infer non-admission.
      const history = await rpc("list_text_turns", { p_policy_id: identity.policyId, p_limit: 20 });
      if (record(history) && history.kind === "unavailable") return null;
      if (!record(history) || !exact(history, ["kind", "turns"]) || history.kind !== "history" || !Array.isArray(history.turns) || history.turns.length > 20) throw new RecoveryFailure("PROVIDER_UNAVAILABLE");
      const ids = new Set<string>(); let candidate: Record<string, unknown> | null = null;
      for (const item of history.turns) {
        if (!record(item) || !exact(item, ["turnId", "threadId", "locale", "input", "outcome", "output", "status", "createdAt"])
          || !canonicalUuid(item.turnId) || !canonicalUuid(item.threadId) || ids.has(item.turnId)
          || typeof item.input !== "string" || item.input.length > 4000 || typeof item.createdAt !== "string"
          || typeof item.status !== "string" || typeof item.locale !== "string"
          || (item.output !== null && (typeof item.output !== "string" || item.output.length > 8000))) throw new RecoveryFailure("PROVIDER_UNAVAILABLE");
        ids.add(item.turnId);
        if (item.turnId === identity.turnId) candidate = item;
      }
      if (!candidate || candidate.threadId !== identity.threadId || candidate.status !== turn.status) return null;
      const text = await rpc("read_text_turn", { p_turn_id: identity.turnId });
      if (record(text) && text.kind === "unavailable") return null;
      if (!record(text) || !exact(text, ["kind", "schemaVersion", "turnId", "locale", "input", "outcome", "output"])
        || text.kind !== "text" || text.schemaVersion !== "text-turn-v1") throw new RecoveryFailure("PROVIDER_UNAVAILABLE");
      if (["turnId", "locale", "input", "outcome", "output"].some(field => candidate[field] !== text[field])) return null;
      return { recovery: projectTranslationRecovery(identity, candidate), evidence: { thread, turn, key, candidate, text } };
    };
    await session(); await policy();
    const first = await snapshot();
    await policy(); await session();
    const last = await snapshot();
    await policy(); await session();
    scope.check();
    return reply(first && last && JSON.stringify(first) === JSON.stringify(last) ? last.recovery : unknownTranslationRecovery(identity));
  } catch (error) { return failure(error instanceof RecoveryFailure ? error.code : "PROVIDER_UNAVAILABLE"); }
  finally { scope.dispose(); }
}
