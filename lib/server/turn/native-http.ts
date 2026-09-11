import type { NextRequest } from "next/server";
import { nativeRequestScope } from "../identity/native-request.ts";
import { getNativeRuntimeConfig, isLocalNativeTarget } from "../identity/native-config.ts";
import { getSupabasePublicConfig } from "../identity/user-data-adapter.ts";
import { verifyNativeCredentials } from "../identity/native-credentials.ts";
import { isUuid } from "../identity/request-guards.ts";
import { FAILURE_TAXONOMY, type FailureCode } from "../contracts/errors/index.ts";

type Action = "policy" | "history" | "accept" | "withdraw" | "submit" | "cancel";
const response = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const failure = (code: FailureCode) => response({ error: { code } }, FAILURE_TAXONOMY[code].httpStatus);
export function getNativeTextConfig(request: Pick<Request, "url">) {
  if (process.env.VISEPANDA_NATIVE_STAGING === "true") {
    const config = getNativeRuntimeConfig(request, "trip"), policyId = process.env.VISEPANDA_NATIVE_STAGING_TEXT_POLICY;
    return process.env.VISEPANDA_NATIVE_STAGING_TEXT === "true" && config?.environment === "staging" && uuid(policyId)
      ? { ...config, policyId: policyId.toLowerCase() } : null;
  }
  const config = getSupabasePublicConfig(), policyId = process.env.VISEPANDA_NATIVE_LOCAL_TEXT_POLICY;
  if (process.env.VERCEL_ENV || process.env.VISEPANDA_NATIVE_LOCAL_TEXT !== "true" || !config || !uuid(policyId)) return null;
  return isLocalNativeTarget(config.url) ? { ...config, policyId: policyId.toLowerCase() } : null;
}

export async function nativeTextHTTP(request: NextRequest, action: Action, turnId?: string) {
  const config = getNativeTextConfig(request);
  if (!config) return failure("PROVIDER_UNAVAILABLE");
  if (request.headers.has("cookie") || request.headers.has("origin") || [...request.nextUrl.searchParams].length
    || (turnId !== undefined && !uuid(turnId))) return failure("INVALID_INPUT");
  const scope = nativeRequestScope(request.signal);
  try {
    const actor = await scope.run(() => verifyNativeCredentials(request, config, scope.fetch, scope.unavailable));
    if (!actor) return failure("UNAUTHENTICATED");
    const rpc = async (name: string, params: Readonly<Record<string, string | number>> = {}) => scope.run(() => actor.client.rpc(name, params).abortSignal(scope.signal));
    const session = await rpc("native_session_v2", { p_action: "session" });
    if (session.error) return failure(mapError(session.error.message));
    if (!record(session.data) || !uuid(session.data.subject) || !uuid(session.data.sessionId)) return failure("PROVIDER_UNAVAILABLE");
    if (session.data.subject !== actor.subject || session.data.sessionId !== actor.sessionId) return failure("UNAUTHENTICATED");
    let result;
    if (action === "policy") result = await rpc("read_text_policy", { p_policy_id: config.policyId });
    else if (action === "history") result = await rpc("list_text_turns", { p_policy_id: config.policyId, p_limit: 20 });
    else {
      const input = await scope.run(() => boundedBody(request, scope.signal));
      if (!record(input)) return failure("INVALID_INPUT");
      if (action === "accept" && exact(input,["policyId","noticeHash"]) && input.policyId === config.policyId && typeof input.noticeHash === "string" && /^[a-f0-9]{64}$/.test(input.noticeHash)) {
        result = await rpc("accept_text_policy", { p_policy_id: config.policyId, p_notice_hash: input.noticeHash });
      } else if (action === "withdraw" && exact(input,["policyId"]) && uuid(input.policyId)) {
        // Withdrawal remains available even when the deployment's selected policy changes.
        result = await rpc("withdraw_text_policy", { p_policy_id: input.policyId });
      } else if (action === "submit" && exact(input,["threadId","turnId","idempotencyKey","policyId","locale","text"])
        && uuid(input.threadId) && uuid(input.turnId) && uuid(input.idempotencyKey) && input.policyId === config.policyId
        && typeof input.locale === "string" && ["zh","en","es","ru","ar"].includes(input.locale)
        && typeof input.text === "string" && input.text.trim().length > 0 && input.text.length <= 4000) {
        result = await rpc("submit_text_turn", { p_thread_id: input.threadId, p_turn_id: input.turnId, p_idempotency_key: input.idempotencyKey, p_policy_id: config.policyId, p_locale: input.locale, p_text: input.text });
      } else if (action === "cancel" && turnId && exact(input,[])) {
        result = await rpc("cancel_chat_turn", { p_turn_id: turnId });
        if (!result.error) return response({ version: 1, kind: "cancelled" });
      } else return failure("INVALID_INPUT");
    }
    if (result.error) return failure(mapError(result.error.message));
    if (!record(result.data) || typeof result.data.kind !== "string") return failure("INTERNAL_ERROR");
    if (["blocked","unavailable"].includes(result.data.kind)) return failure("DATA_POLICY_BLOCKED");
    return response({ version: 1, ...result.data }, action === "submit" && result.data.reused !== true ? 201 : 200);
  } catch { return failure("PROVIDER_UNAVAILABLE"); }
  finally { scope.dispose(); }
}
function mapError(message: string): FailureCode {
  if (/UNAUTHENTICATED|SESSION_REPLACED/.test(message)) return "UNAUTHENTICATED";
  if (message.includes("IDEMPOTENCY_KEY_REUSE")) return "IDEMPOTENCY_KEY_REUSE";
  if (message.includes("DATA_POLICY_BLOCKED")) return "DATA_POLICY_BLOCKED";
  if (message.includes("INVALID_INPUT")) return "INVALID_INPUT";
  if (message.includes("FORBIDDEN")) return "FORBIDDEN";
  return "PROVIDER_UNAVAILABLE";
}
async function boundedBody(request: NextRequest, parentSignal: AbortSignal): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json" || !request.body) return null;
  const reader = request.body.getReader(), parts: Uint8Array[] = [];
  let bytes = 0;
  const scope = nativeRequestScope(parentSignal, 5000);
  try {
    for (;;) {
      const next = await scope.run(() => reader.read());
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 32768) return null;
      parts.push(next.value);
    }
    scope.check();
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts))); }
    catch { return null; }
  } finally {
    scope.dispose();
    try { void reader.cancel().catch(() => {}); } catch { /* already closed */ }
    try { reader.releaseLock(); } catch { /* pending read may retain its lock */ }
  }
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exact(value: Record<string, unknown>, keys: readonly string[]) { return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key)); }

function uuid(value: unknown): value is string { return typeof value === "string" && isUuid(value); }
