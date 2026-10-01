import type { NextRequest } from "next/server";
import { nativeRequestScope } from "../identity/native-request.ts";
import { verifyNativeCredentials } from "../identity/native-credentials.ts";
import { getNativeTextConfig } from "./native-http.ts";
import { isUuid } from "../identity/request-guards.ts";
import { FAILURE_TAXONOMY, type FailureCode } from "../contracts/errors/index.ts";
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = (code: FailureCode) => reply({ error: { code } }, FAILURE_TAXONOMY[code].httpStatus);
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export async function nativeAssistantTasksHTTP(request: NextRequest, conversationId: string) {
  const config = getNativeTextConfig(request);
  if (!config) return fail("PROVIDER_UNAVAILABLE");
  const query = [...request.nextUrl.searchParams];
  if (request.method !== "GET" || !isUuid(conversationId) || request.headers.has("cookie") || request.headers.has("origin")
    || query.length > 1 || (query.length === 1 && query[0][0] !== "cursor")) return fail("INVALID_INPUT");
  let cursor: Record<string, unknown> | null = null;
  const encoded = request.nextUrl.searchParams.get("cursor");
  if (encoded !== null) {
    if (!/^[A-Za-z0-9_-]{1,512}$/.test(encoded)) return fail("INVALID_INPUT");
    try {
      const parsed: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
      if (!record(parsed) || Object.keys(parsed).length !== 4 || parsed.version !== 1
        || parsed.conversationId !== conversationId || !Number.isInteger(parsed.conversationSequence)
        || Number(parsed.conversationSequence) < 1 || Number(parsed.conversationSequence) > 1000001
        || typeof parsed.messageId !== "string" || !isUuid(parsed.messageId)) return fail("INVALID_INPUT");
      cursor = parsed;
    } catch { return fail("INVALID_INPUT"); }
  }
  const scope = nativeRequestScope(request.signal);
  try {
    const actor = await scope.run(() => verifyNativeCredentials(request, config, scope.fetch, scope.unavailable));
    if (!actor) return fail("UNAUTHENTICATED");
    const session = await scope.run(() => actor.client.rpc("native_session_v2", { p_action: "session" }).abortSignal(scope.signal));
    if (session.error) return fail(/UNAUTHENTICATED|SESSION_REPLACED/.test(session.error.message) ? "UNAUTHENTICATED" : "PROVIDER_UNAVAILABLE");
    if (!record(session.data) || session.data.subject !== actor.subject || session.data.sessionId !== actor.sessionId) return fail("UNAUTHENTICATED");
    const result = await scope.run(() => actor.client.rpc("list_assistant_conversation_tasks_v1", {
      p_policy_id: config.policyId, p_conversation_id: conversationId, p_cursor: cursor,
    }).abortSignal(scope.signal));
    if (result.error) return fail(/UNAUTHENTICATED|SESSION_REPLACED/.test(result.error.message) ? "UNAUTHENTICATED" : "PROVIDER_UNAVAILABLE");
    if (!record(result.data)) return fail("INTERNAL_ERROR");
    if (result.data.kind === "unavailable") return fail("DATA_POLICY_BLOCKED");
    if (result.data.kind !== "conversation_tasks" || result.data.conversationId !== conversationId) return fail("INTERNAL_ERROR");
    const next = result.data.nextCursor;
    if (next !== null && !record(next)) return fail("INTERNAL_ERROR");
    return reply({ version: 5, ...result.data, nextCursor: next === null ? null : Buffer.from(JSON.stringify(next)).toString("base64url") });
  } catch { return fail("PROVIDER_UNAVAILABLE"); }
  finally { scope.dispose(); }
}
