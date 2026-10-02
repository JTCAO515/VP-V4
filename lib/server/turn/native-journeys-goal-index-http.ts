import type { NextRequest } from "next/server";
import { nativeRequestScope } from "../identity/native-request.ts";
import { verifyNativeCredentials } from "../identity/native-credentials.ts";
import { getNativeTextConfig } from "./native-http.ts";
import { FAILURE_TAXONOMY, type FailureCode } from "../contracts/errors/index.ts";
import { isUuid } from "../identity/request-guards.ts";

const uuid = (value: unknown): value is string => typeof value === "string" && isUuid(value);
const cursorPattern = /^v1\.[a-f0-9-]{36}\.[a-f0-9-]{36}\.[a-f0-9]{32}$/;
export const validJourneysGoalIndexCursor = (cursor: unknown): cursor is string => typeof cursor === "string" && cursorPattern.test(cursor)
  && uuid(cursor.split(".")[1]) && uuid(cursor.split(".")[2]);
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const fail = (code: FailureCode) => Response.json({ error: { code } }, { status: FAILURE_TAXONOMY[code].httpStatus, headers: { "Cache-Control": "private, no-store" } });

export function validJourneysGoalIndexPage(value: unknown): boolean {
  if (!record(value) || !exact(value, ["kind", "snapshot", "goals", "nextCursor"]) || value.kind !== "journeys_goal_index"
    || typeof value.snapshot !== "string" || !/^[a-f0-9]{32}$/.test(value.snapshot) || !Array.isArray(value.goals) || value.goals.length > 20) return false;
  let last = "";
  for (const row of value.goals) {
    if (!record(row) || !exact(row, ["conversationId", "goalId", "scopeVersion", "text", "relation"]) || !uuid(row.conversationId) || !uuid(row.goalId)
      || `${row.conversationId}.${row.goalId}` <= last || !Number.isSafeInteger(row.scopeVersion) || Number(row.scopeVersion) < 1 || Number(row.scopeVersion) > 10001
      || typeof row.text !== "string" || !row.text.trim() || [...row.text].length > 4000 || !record(row.relation) || !exact(row.relation, ["state", "tripId", "tripHeadVersion"])) return false;
    const r = row.relation;
    if (!["unlinked", "linked", "unknown"].includes(String(r.state))) return false;
    if (r.state === "linked" ? !uuid(r.tripId) || !Number.isSafeInteger(r.tripHeadVersion) || Number(r.tripHeadVersion) < 0
      : r.tripId !== null || r.tripHeadVersion !== null) return false;
    last = `${row.conversationId}.${row.goalId}`;
  }
  return value.nextCursor === null || validJourneysGoalIndexCursor(value.nextCursor)
    && value.nextCursor === `v1.${last}.${value.snapshot}` && value.goals.length === 20;
}

export async function nativeJourneysGoalIndexHTTP(request: NextRequest, cursor?: string) {
  if (request.nextUrl.pathname !== "/api/chat/native/v5/journeys-goals" + (cursor ? "/" + cursor : "")
    || request.method !== "GET" || cursor !== undefined && !validJourneysGoalIndexCursor(cursor)
    || request.headers.has("cookie") || request.headers.has("origin") || [...request.nextUrl.searchParams].length) return fail("INVALID_INPUT");
  const config = getNativeTextConfig(request);
  if (!config) return fail("PROVIDER_UNAVAILABLE");
  const scope = nativeRequestScope(request.signal, 15_000);
  try {
    const actor = await scope.run(() => verifyNativeCredentials(request, config, scope.fetch, scope.unavailable));
    if (!actor) return fail("UNAUTHENTICATED");
    const session = await scope.run(() => actor.client.rpc("native_session_v2", { p_action: "session" }).abortSignal(scope.signal));
    if (session.error) return fail(/UNAUTHENTICATED|SESSION_REPLACED/.test(session.error.message) ? "UNAUTHENTICATED" : "PROVIDER_UNAVAILABLE");
    if (!record(session.data) || typeof session.data.subject !== "string" || !isUuid(session.data.subject)
      || typeof session.data.sessionId !== "string" || !isUuid(session.data.sessionId)) return fail("PROVIDER_UNAVAILABLE");
    if (session.data.subject !== actor.subject || session.data.sessionId !== actor.sessionId) return fail("UNAUTHENTICATED");
    const result = await scope.run(() => actor.client.rpc("read_journeys_goal_index_v1", { p_policy_id: config.policyId, p_cursor: cursor ?? null }).abortSignal(scope.signal));
    if (result.error) return fail(/UNAUTHENTICATED|SESSION_REPLACED/.test(result.error.message) ? "UNAUTHENTICATED" : "PROVIDER_UNAVAILABLE");
    if (record(result.data) && result.data.kind === "unavailable") return fail("DATA_POLICY_BLOCKED");
    if (!validJourneysGoalIndexPage(result.data) || Buffer.byteLength(JSON.stringify(result.data), "utf8") > 512_000) return fail("INTERNAL_ERROR");
    if (cursor && ((result.data as Record<string, unknown>).snapshot !== cursor.split(".")[3]
      || (result.data as { goals: { conversationId: string; goalId: string }[] }).goals.some(row => `${row.conversationId}.${row.goalId}` <= `${cursor.split(".")[1]}.${cursor.split(".")[2]}`))) return fail("INTERNAL_ERROR");
    return Response.json({ version: 5, ...(result.data as Record<string, unknown>) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return fail("PROVIDER_UNAVAILABLE"); }
  finally { scope.dispose(); }
}
