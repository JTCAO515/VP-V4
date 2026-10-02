import type { NextRequest } from "next/server";
import { nativeRequestScope } from "../identity/native-request.ts";
import { verifyNativeCredentials } from "../identity/native-credentials.ts";
import { getNativeTextConfig } from "./native-http.ts";
import { isUuid } from "../identity/request-guards.ts";
import { FAILURE_TAXONOMY, type FailureCode } from "../contracts/errors/index.ts";
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = (code: FailureCode) => reply({ error: { code } }, FAILURE_TAXONOMY[code].httpStatus);
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export async function nativeAssistantTaskActivityHTTP(request: NextRequest, conversationId: string, taskId: string) {
  const config = getNativeTextConfig(request);
  if (!config) return fail("PROVIDER_UNAVAILABLE");
  const query = [...request.nextUrl.searchParams];
  if (request.method !== "GET" || !isUuid(conversationId) || !isUuid(taskId) || request.headers.has("cookie") || request.headers.has("origin")
    || query.length !== 0) return fail("INVALID_INPUT");
  const scope = nativeRequestScope(request.signal);
  try {
    const actor = await scope.run(() => verifyNativeCredentials(request, config, scope.fetch, scope.unavailable));
    if (!actor) return fail("UNAUTHENTICATED");
    const session = await scope.run(() => actor.client.rpc("native_session_v2", { p_action: "session" }).abortSignal(scope.signal));
    if (session.error) return fail(/UNAUTHENTICATED|SESSION_REPLACED/.test(session.error.message) ? "UNAUTHENTICATED" : "PROVIDER_UNAVAILABLE");
    if (!record(session.data) || typeof session.data.subject !== "string" || !isUuid(session.data.subject)
      || typeof session.data.sessionId !== "string" || !isUuid(session.data.sessionId)) return fail("PROVIDER_UNAVAILABLE");
    if (session.data.subject !== actor.subject || session.data.sessionId !== actor.sessionId) return fail("UNAUTHENTICATED");
    const result = await scope.run(() => actor.client.rpc("read_assistant_task_activity_v1", {
      p_policy_id: config.policyId, p_conversation_id: conversationId, p_task_id: taskId,
    }).abortSignal(scope.signal));
    if (result.error) return fail(/UNAUTHENTICATED|SESSION_REPLACED/.test(result.error.message) ? "UNAUTHENTICATED" : "PROVIDER_UNAVAILABLE");
    if (!record(result.data)) return fail("INTERNAL_ERROR");
    if (result.data.kind === "unavailable") return fail("DATA_POLICY_BLOCKED");
    const data = result.data;
    const tools = ["evidence.lookup", "place.read", "constraints.evaluate", "result.prepare"];
    const statuses = ["accepted", "planning", "retrieving", "generating", "validating", "completed", "failed", "cancelled", "unavailable"];
    if (data.kind !== "task_activity" || data.conversationId !== conversationId || data.taskId !== taskId
      || typeof data.turnId !== "string" || !isUuid(data.turnId) || typeof data.turnStatus !== "string" || !statuses.includes(data.turnStatus)
      || data.limit !== 4 || !Array.isArray(data.actions) || data.actions.length > 4
      || data.recording !== (data.actions.length === 0 ? "unrecorded" : "recorded")
      || data.actions.some(action => !record(action) || Object.keys(action).length !== 2
        || typeof action.tool !== "string" || !tools.includes(action.tool)
        || typeof action.state !== "string" || !["started", "completed", "unknown"].includes(action.state))) return fail("INTERNAL_ERROR");
    // Explicit allowlist: a future RPC field cannot expose private receipt data through HTTP.
    return reply({ version: 5, kind: data.kind, conversationId, taskId, turnId: data.turnId,
      turnStatus: data.turnStatus, limit: 4, recording: data.recording, actions: data.actions });
  } catch { return fail("PROVIDER_UNAVAILABLE"); }
  finally { scope.dispose(); }
}
