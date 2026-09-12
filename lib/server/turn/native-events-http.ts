import type { NextRequest } from "next/server";
import { nativeRequestScope } from "../identity/native-request.ts";
import { verifyNativeCredentials } from "../identity/native-credentials.ts";
import { isUuid } from "../identity/request-guards.ts";
import { getNativeTextConfig } from "./native-http.ts";
import { resolveTurnReplayCursor, TURN_SSE_CONTENT_TYPE } from "./sse-replay.ts";
import { groundedEventFrames } from "./grounded-events.ts";

const failure = (code: string, status: number) => Response.json({ error: { code } }, { status, headers: { "Cache-Control": "private, no-store" } });
export async function nativeGroundedEvents(request: NextRequest, turnId: string) {
  const config = getNativeTextConfig(request, "grounded");
  if (!config) return failure("PROVIDER_UNAVAILABLE", 503);
  if (!isUuid(turnId) || request.headers.has("cookie") || request.headers.has("origin") || [...request.nextUrl.searchParams].length) return failure("INVALID_INPUT", 400);
  let cursor: number;
  try { cursor = resolveTurnReplayCursor({ afterSequence: null, lastEventId: request.headers.get("last-event-id") }); }
  catch { return failure("INVALID_INPUT", 400); }
  const scope = nativeRequestScope(request.signal);
  let streaming = false;
  try {
    const actor = await scope.run(() => verifyNativeCredentials(request, config, scope.fetch, scope.unavailable));
    if (!actor) return failure("UNAUTHENTICATED", 401);
    const session = await scope.run(() => actor.client.rpc("native_session_v2", { p_action: "session" }).abortSignal(scope.signal));
    if (session.error) return /UNAUTHENTICATED|SESSION_REPLACED/.test(session.error.message) ? failure("UNAUTHENTICATED", 401) : failure("PROVIDER_UNAVAILABLE", 503);
    if (typeof session.data?.subject !== "string" || !isUuid(session.data.subject)
      || typeof session.data?.sessionId !== "string" || !isUuid(session.data.sessionId)) return failure("PROVIDER_UNAVAILABLE", 503);
    if (session.data?.subject !== actor.subject || session.data?.sessionId !== actor.sessionId) return failure("UNAUTHENTICATED", 401);
    const read = async () => {
      const reply = await scope.run(() => actor.client.rpc("read_grounded_events", { p_policy_id: config.policyId, p_turn_id: turnId, p_after_sequence: cursor }).abortSignal(scope.signal));
      if (reply.error) throw new Error(/UNAUTHENTICATED|SESSION_REPLACED/.test(reply.error.message) ? "UNAUTHENTICATED" : reply.error.message.includes("INVALID_INPUT") ? "INVALID_INPUT" : "PROVIDER_UNAVAILABLE");
      if (reply.data?.kind === "unavailable") throw new Error("DATA_POLICY_BLOCKED");
      return groundedEventFrames(reply.data, turnId, cursor);
    };
    const initial = await read(); // Before headers: no unauthorized stream opens.
    streaming = true;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          let frame = initial;
          for (let tick = 0; tick < 7; tick++) {
            scope.check();
            controller.enqueue(encoder.encode(frame.text));
            cursor = frame.cursor;
            if (frame.terminal || tick === 6) break;
            await scope.run(() => new Promise(resolve => setTimeout(resolve, 1000)));
            frame = await read(); // Rechecks session, consent and source authority.
          }
          controller.close();
        } catch {
          // No cursor on failure; a broken connection never settles model usage.
          try { controller.enqueue(encoder.encode('event: unavailable\ndata: {}\n\n')); controller.close(); } catch { /* consumer cancelled */ }
        } finally { scope.dispose(); }
      },
      cancel() { scope.dispose(); },
    });
    return new Response(stream, { headers: { "Content-Type": TURN_SSE_CONTENT_TYPE, "Cache-Control": "private, no-store", "X-Accel-Buffering": "no" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PROVIDER_UNAVAILABLE";
    return failure(["UNAUTHENTICATED", "INVALID_INPUT", "DATA_POLICY_BLOCKED"].includes(code) ? code : "PROVIDER_UNAVAILABLE", code === "UNAUTHENTICATED" ? 401 : code === "INVALID_INPUT" ? 400 : code === "DATA_POLICY_BLOCKED" ? 403 : 503);
  } finally { if (!streaming) scope.dispose(); }
}
