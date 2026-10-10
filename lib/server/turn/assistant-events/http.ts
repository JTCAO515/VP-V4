import type { NextRequest } from "next/server";
import { nativeRequestScope } from "../../identity/native-request.ts";
import { verifyNativeCredentials } from "../../identity/native-credentials.ts";
import { isUuid } from "../../identity/request-guards.ts";
import { getNativeTextConfig } from "../native-http.ts";
import { TURN_SSE_CONTENT_TYPE } from "../sse-replay.ts";
import { assistantReplayCursor, decodeAssistantEvents, assistantEventFrames, ASSISTANT_EVENTS_LIMIT } from "./protocol.ts";
import { boundedAssistantReplayResponse } from "./transport.ts";
const fail = (code: string, status: number) => Response.json({ error: { code } }, { status, headers: { "Cache-Control": "private, no-store" } });
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Finite durable replay, using the original ordinary-user JWT transport. No worker,
 * provider dispatch, usage settlement or Trip writer is reachable from this reader. */
export async function nativeAssistantEventsHTTP(request: NextRequest, conversationId: string) {
  if (request.method !== "GET" || !isUuid(conversationId) || request.headers.has("cookie") || request.headers.has("origin") || [...request.nextUrl.searchParams].length) return fail("INVALID_INPUT", 400);
  let after: number;
  try { after = assistantReplayCursor(request.headers.get("last-event-id")); } catch { return fail("INVALID_INPUT", 400); }
  // Independent additive reader activation, default deny; no existing producer flag is changed.
  if (process.env.VISEPANDA_NATIVE_ASSISTANT_EVENTS !== "true") return fail("PROVIDER_UNAVAILABLE", 503);
  const config = getNativeTextConfig(request);
  if (!config) return fail("PROVIDER_UNAVAILABLE", 503);
  const scope = nativeRequestScope(request.signal);
  try {
    const transport: typeof fetch = async (input, init) => {
      const response = await scope.fetch(input, init);
      const url = input instanceof Request ? input.url : String(input);
      return new URL(url).pathname === "/rest/v1/rpc/read_assistant_events_v1"
        ? scope.run(() => boundedAssistantReplayResponse(response)) : response;
    };
    const actor = await scope.run(() => verifyNativeCredentials(request, config, transport, scope.unavailable));
    if (!actor) return fail("UNAUTHENTICATED", 401);
    const session = await scope.run(() => actor.client.rpc("native_session_v2", { p_action: "session" }).abortSignal(scope.signal));
    if (session.error) return fail(/UNAUTHENTICATED|SESSION_REPLACED/.test(session.error.message) ? "UNAUTHENTICATED" : "PROVIDER_UNAVAILABLE", /UNAUTHENTICATED|SESSION_REPLACED/.test(session.error.message) ? 401 : 503);
    if (!record(session.data) || typeof session.data.subject !== "string" || !isUuid(session.data.subject) || typeof session.data.sessionId !== "string" || !isUuid(session.data.sessionId)) return fail("PROVIDER_UNAVAILABLE", 503);
    if (session.data.subject !== actor.subject || session.data.sessionId !== actor.sessionId) return fail("UNAUTHENTICATED", 401);
    const result = await scope.run(() => actor.client.rpc("read_assistant_events_v1", {
      p_policy_id: config.policyId, p_conversation_id: conversationId, p_after_sequence: after, p_limit: ASSISTANT_EVENTS_LIMIT,
    }).abortSignal(scope.signal));
    if (result.error) {
      const message = result.error.message;
      return /UNAUTHENTICATED|SESSION_REPLACED/.test(message) ? fail("UNAUTHENTICATED", 401)
        : /INVALID_INPUT/.test(message) ? fail("INVALID_INPUT", 400) : fail("PROVIDER_UNAVAILABLE", 503);
    }
    if (record(result.data) && result.data.kind === "unavailable") return fail("DATA_POLICY_BLOCKED", 403);
    let text: string;
    try { text = assistantEventFrames(decodeAssistantEvents(result.data, conversationId, after)); }
    catch { return fail("INTERNAL_ERROR", 500); }
    scope.check();
    return new Response(text, { headers: { "Content-Type": TURN_SSE_CONTENT_TYPE, "Cache-Control": "private, no-store", "X-Accel-Buffering": "no" } });
  } catch { return fail("PROVIDER_UNAVAILABLE", 503); }
  finally { scope.dispose(); }
}
