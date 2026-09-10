import type { NextRequest } from "next/server";
import { getSupabasePublicConfig } from "../identity/user-data-adapter.ts";
import { verifyNativeCredentials } from "../identity/native-credentials.ts";
import { isUuid } from "../identity/request-guards.ts";
import { FAILURE_TAXONOMY, type FailureCode } from "../contracts/errors/index.ts";

type Action = "policy" | "history" | "accept" | "withdraw" | "submit" | "cancel";
const response = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const failure = (code: FailureCode) => response({ error: { code } }, FAILURE_TAXONOMY[code].httpStatus);
export function getLocalNativeTextConfig() {
  const config = getSupabasePublicConfig(), policyId = process.env.VISEPANDA_NATIVE_LOCAL_TEXT_POLICY;
  if (process.env.VISEPANDA_NATIVE_LOCAL_TEXT !== "true" || !config || !uuid(policyId)) return null;
  try {
    const url = new URL(config.url);
    return url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname) && !url.username && !url.password ? { ...config, policyId: policyId.toLowerCase() } : null;
  } catch { return null; }
}

export async function nativeTextHTTP(request: NextRequest, action: Action, turnId?: string) {
  const config = getLocalNativeTextConfig();
  if (!config) return failure("PROVIDER_UNAVAILABLE");
  if (request.headers.has("cookie") || request.headers.has("origin") || [...request.nextUrl.searchParams].length
    || (turnId !== undefined && !uuid(turnId))) return failure("INVALID_INPUT");
  try {
    const actor = await verifyNativeCredentials(request, config);
    if (!actor) return failure("UNAUTHENTICATED");
    const rpc = async (name: string, params: Readonly<Record<string, string | number>> = {}) => actor.client.rpc(name, params).abortSignal(AbortSignal.timeout(10_000));
    const session = await rpc("native_session_v2", { p_action: "session" });
    if (session.error || session.data?.subject !== actor.subject || session.data?.sessionId !== actor.sessionId) return failure("UNAUTHENTICATED");
    let result;
    if (action === "policy") result = await rpc("read_text_policy", { p_policy_id: config.policyId });
    else if (action === "history") result = await rpc("list_text_turns", { p_policy_id: config.policyId, p_limit: 20 });
    else {
      const input = await boundedBody(request);
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
}
function mapError(message: string): FailureCode {
  if (/UNAUTHENTICATED|SESSION_REPLACED/.test(message)) return "UNAUTHENTICATED";
  if (message.includes("IDEMPOTENCY_KEY_REUSE")) return "IDEMPOTENCY_KEY_REUSE";
  if (message.includes("DATA_POLICY_BLOCKED")) return "DATA_POLICY_BLOCKED";
  if (message.includes("INVALID_INPUT")) return "INVALID_INPUT";
  if (message.includes("FORBIDDEN")) return "FORBIDDEN";
  return "PROVIDER_UNAVAILABLE";
}
async function boundedBody(request: NextRequest): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json" || !request.body) return null;
  const reader = request.body.getReader(), parts: Uint8Array[] = [];
  let bytes = 0;
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(5000)]);
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (!signal.aborted) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 32768) return null;
      parts.push(next.value);
    }
    if (signal.aborted) return null;
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts)));
  } catch { return null; }
  finally { signal.removeEventListener("abort", cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exact(value: Record<string, unknown>, keys: readonly string[]) { return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key)); }

function uuid(value: unknown): value is string { return typeof value === "string" && isUuid(value); }
