import { getNativeRuntimeConfig } from "../identity/native-config.ts";
import { verifyNativeCredentials } from "../identity/native-credentials.ts";
import { nativeRequestScope } from "../identity/native-request.ts";
import { isUuid } from "../identity/request-guards.ts";

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const failure = (code: string, status: number) => reply({ error: { code } }, status);
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Trip discovery yields an inert pointer, never a comparison fallback or Proposal body. */
export async function nativeTripChangeProposalReferenceHTTP(request: Request): Promise<Response> {
  const config = getNativeRuntimeConfig(request, "session");
  if (!config) return failure("RESULT_UNAVAILABLE", 503);
  if (request.method !== "GET" || request.headers.has("cookie") || request.headers.has("origin")) return failure("INVALID_INPUT", 400);
  const params = new URL(request.url).searchParams;
  if (params.size !== 1 || params.getAll("tripId").length !== 1 || !isUuid(params.get("tripId") ?? "")) return failure("INVALID_INPUT", 400);
  const tripId = params.get("tripId")!.toLowerCase();
  const scope = nativeRequestScope(request.signal);
  try {
    const actor = await scope.run(() => verifyNativeCredentials(request, config, scope.fetch, scope.unavailable));
    if (!actor) return failure("UNAUTHENTICATED", 401);
    const session = await scope.run(() => actor.client.rpc("native_session_v2", { p_action: "session" }).abortSignal(scope.signal));
    if (session.error) return failure(/UNAUTHENTICATED|SESSION_REPLACED/.test(session.error.message) ? "UNAUTHENTICATED" : "RESULT_UNAVAILABLE", /UNAUTHENTICATED|SESSION_REPLACED/.test(session.error.message) ? 401 : 503);
    if (!record(session.data) || typeof session.data.subject !== "string" || !isUuid(session.data.subject)
      || typeof session.data.sessionId !== "string" || !isUuid(session.data.sessionId)) return failure("RESULT_UNAVAILABLE", 503);
    if (session.data.subject !== actor.subject || session.data.sessionId !== actor.sessionId) return failure("UNAUTHENTICATED", 401);
    const result = await scope.run(() => actor.client.rpc("read_trip_change_proposal_reference_v1", { p_trip_id: tripId }).abortSignal(scope.signal));
    if (result.error) return failure("RESULT_UNAVAILABLE", 503);
    const data = result.data;
    if (!record(data)) return failure("RESULT_UNAVAILABLE", 503);
    if ((data.kind === "empty" || data.kind === "unavailable") && Object.keys(data).length === 1) return reply({ version: 1, data });
    if (Object.keys(data).length !== 4 || data.kind !== "result_reference" || data.tripId !== tripId
      || typeof data.artifactId !== "string" || !isUuid(data.artifactId)
      || !Number.isSafeInteger(data.revision) || Number(data.revision) < 1 || Number(data.revision) > 1000) return failure("RESULT_UNAVAILABLE", 503);
    return reply({ version: 1, data });
  } catch { return failure("RESULT_UNAVAILABLE", 503); }
  finally { scope.dispose(); }
}
