import type { NextRequest } from "next/server";
import { nativeRequestScope } from "../identity/native-request.ts";
import { verifyNativeCredentials } from "../identity/native-credentials.ts";
import { isUuid } from "../identity/request-guards.ts";
import { FAILURE_TAXONOMY, type FailureCode } from "../contracts/errors/index.ts";
import { getNativeAssistantConfig } from "./native-assistant-http.ts";

type Payload = Record<string, unknown>;
const response = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const failure = (code: FailureCode) => response({ error: { code } }, FAILURE_TAXONOMY[code].httpStatus);
const record = (value: unknown): value is Payload => value !== null && typeof value === "object" && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === "string" && isUuid(value);

export async function nativeAssistantTripHTTP(request: NextRequest, goalId: string) {
  const config = getNativeAssistantConfig(request);
  if (!config) return failure("PROVIDER_UNAVAILABLE");
  if (!uuid(goalId) || !["GET","POST"].includes(request.method) || request.headers.has("cookie")
    || request.headers.has("origin") || [...request.nextUrl.searchParams].length) return failure("INVALID_INPUT");
  const scope = nativeRequestScope(request.signal, 15_000);
  try {
    let input: Payload | null = null;
    if (request.method === "POST") {
      if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return failure("INVALID_INPUT");
      const raw = await scope.run(() => scope.body(request, 4096));
      try { const parsed: unknown = raw ? JSON.parse(raw) : null; input = record(parsed) ? parsed : null; }
      catch { return failure("INVALID_INPUT"); }
      if (!input || Object.keys(input).length !== 9
        || !["operationId","conversationId","sourceMessageId","expectedGoalScopeVersion","expectedLinkVersion","action","tripId","expectedTripVersion","confirmed"].every(key => Object.hasOwn(input ?? {},key))
        || !uuid(input.operationId) || !uuid(input.conversationId)
        || (input.sourceMessageId !== null && !uuid(input.sourceMessageId))
        || (input.tripId !== null && !uuid(input.tripId))
        || !Number.isSafeInteger(input.expectedGoalScopeVersion) || Number(input.expectedGoalScopeVersion) < 1
        || !Number.isSafeInteger(input.expectedLinkVersion) || Number(input.expectedLinkVersion) < 0
        || (input.expectedTripVersion !== null && (!Number.isSafeInteger(input.expectedTripVersion) || Number(input.expectedTripVersion) < 0))
        || !["link","unlink"].includes(String(input.action)) || input.confirmed !== true
        || (input.action === "link" && (input.tripId === null || input.expectedTripVersion === null))
        || (input.action === "unlink" && (input.sourceMessageId !== null || input.tripId !== null || input.expectedTripVersion !== null)))
        return failure("INVALID_INPUT");
    }
    const actor = await scope.run(() => verifyNativeCredentials(request, config, scope.fetch, scope.unavailable));
    if (!actor) return failure("UNAUTHENTICATED");
    const rpc = async (name: string, params: Record<string,string|number|boolean|null>) => scope.run(() => actor.client.rpc(name, params).abortSignal(scope.signal));
    const session = await rpc("native_session_v2", { p_action:"session" });
    if (session.error) return failure(mapError(session.error.message));
    if (!record(session.data) || session.data.subject !== actor.subject || session.data.sessionId !== actor.sessionId)
      return failure("UNAUTHENTICATED");
    const result = request.method === "GET"
      ? await rpc("read_assistant_goal_trip_link_v1", { p_goal_id:goalId })
      : await rpc("set_assistant_goal_trip_link_v1", {
        p_operation_id:input!.operationId as string,p_conversation_id:input!.conversationId as string,p_goal_id:goalId,
        p_source_message_id:input!.sourceMessageId as string|null,
        p_expected_goal_scope_version:input!.expectedGoalScopeVersion as number,
        p_expected_link_version:input!.expectedLinkVersion as number,p_action:input!.action as string,
        p_trip_id:input!.tripId as string|null,p_expected_trip_version:input!.expectedTripVersion as number|null,
        p_confirmed:true,
      });
    if (result.error) return failure(mapError(result.error.message));
    if (!record(result.data)) return failure("INTERNAL_ERROR");
    if (result.data.kind === "unavailable") return failure("DATA_POLICY_BLOCKED");
    if (result.data.kind !== "goal_trip_link" || result.data.goalId !== goalId && request.method === "GET")
      return failure("INTERNAL_ERROR");
    return response({ version:5, ...result.data }, request.method === "POST" && result.data.reused !== true ? 201 : 200);
  } catch { return failure("PROVIDER_UNAVAILABLE"); }
  finally { scope.dispose(); }
}

function mapError(message: string): FailureCode {
  if (/UNAUTHENTICATED|SESSION_REPLACED/.test(message)) return "UNAUTHENTICATED";
  if (message.includes("IDEMPOTENCY_KEY_REUSE")) return "IDEMPOTENCY_KEY_REUSE";
  if (message.includes("STALE_TRIP_VERSION")) return "STALE_TRIP_VERSION";
  if (/TRIP_DELETION_PENDING_OR_COMPLETED|PROPOSAL_NOT_CONFIRMABLE/.test(message)) return "PROPOSAL_NOT_CONFIRMABLE";
  if (message.includes("SERVICE_TASK_CONFLICT")) return "SERVICE_TASK_CONFLICT";
  if (message.includes("DATA_POLICY_BLOCKED")) return "DATA_POLICY_BLOCKED";
  if (message.includes("INVALID_INPUT")) return "INVALID_INPUT";
  if (message.includes("FORBIDDEN")) return "FORBIDDEN";
  return "PROVIDER_UNAVAILABLE";
}
