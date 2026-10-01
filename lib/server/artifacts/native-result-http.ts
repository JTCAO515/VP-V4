import { getNativeRuntimeConfig } from "../identity/native-config.ts";
import { verifyNativeCredentials } from "../identity/native-credentials.ts";
import { nativeRequestScope } from "../identity/native-request.ts";
import { isUuid } from "../identity/request-guards.ts";
import { parseResultArtifactRead } from "./result-contract.ts";

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const failure = (code: string, status: number) => reply({ error: { code } }, status);

/** Read remains available after a producer flag is disabled; SQL rechecks consent and basis. */
export async function nativeResultHTTP(request: Request): Promise<Response> {
  const config = getNativeRuntimeConfig(request, "session");
  if (!config) return failure("RESULT_UNAVAILABLE", 503);
  if (request.method !== "GET" || request.headers.has("cookie") || request.headers.has("origin")) return failure("INVALID_INPUT", 400);
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some(key => !["artifactId", "revision"].includes(key))
    || url.searchParams.getAll("artifactId").length > 1 || url.searchParams.getAll("revision").length > 1) return failure("INVALID_INPUT", 400);
  const artifactId = url.searchParams.get("artifactId"), revisionText = url.searchParams.get("revision");
  const revision = revisionText === null ? null : Number(revisionText);
  if ((artifactId !== null && !isUuid(artifactId)) || (revisionText !== null && (!artifactId || !/^[1-9][0-9]{0,3}$/.test(revisionText) || !Number.isSafeInteger(revision)))) return failure("INVALID_INPUT", 400);
  const scope = nativeRequestScope(request.signal);
  try {
    const actor = await scope.run(() => verifyNativeCredentials(request, config, scope.fetch, scope.unavailable));
    if (!actor) return failure("UNAUTHENTICATED", 401);
    const session = await scope.run(() => actor.client.rpc("native_session_v2", { p_action: "session" }).abortSignal(scope.signal));
    if (session.error) return failure(/UNAUTHENTICATED|SESSION_REPLACED/.test(session.error.message) ? "UNAUTHENTICATED" : "RESULT_UNAVAILABLE", /UNAUTHENTICATED|SESSION_REPLACED/.test(session.error.message) ? 401 : 503);
    if (session.data?.subject !== actor.subject || session.data?.sessionId !== actor.sessionId) return failure("UNAUTHENTICATED", 401);
    const result = await scope.run(() => actor.client.rpc("read_result_artifacts_v1", { p_artifact_id: artifactId, p_revision: revision }).abortSignal(scope.signal));
    if (result.error) return failure("RESULT_UNAVAILABLE", 503);
    if (result.data?.kind === "empty" || result.data?.kind === "unavailable") return reply({ version: 1, data: { kind: result.data.kind } });
    const parsed = parseResultArtifactRead(result.data);
    if (!parsed) return failure("RESULT_UNAVAILABLE", 503);
    return reply({ version: 1, data: parsed });
  } catch { return failure("RESULT_UNAVAILABLE", 503); }
  finally { scope.dispose(); }
}

/** Trip entry resolves an exact reference; the caller opens it with nativeResultHTTP. */
export async function nativeTripResultReferenceHTTP(request: Request): Promise<Response> {
  return nativeResultReferenceHTTP(request, "tripId", "read_trip_result_reference_v1", "p_trip_id");
}

export async function nativeTaskResultReferenceHTTP(request: Request): Promise<Response> {
  return nativeResultReferenceHTTP(request, "taskId", "read_task_result_reference_v1", "p_task_id");
}

async function nativeResultReferenceHTTP(request: Request, field: "tripId" | "taskId", rpc: string, parameter: string): Promise<Response> {
  const config = getNativeRuntimeConfig(request, "session");
  if (!config) return failure("RESULT_UNAVAILABLE", 503);
  if (request.method !== "GET" || request.headers.has("cookie") || request.headers.has("origin")) return failure("INVALID_INPUT", 400);
  const params = new URL(request.url).searchParams;
  if (params.size !== 1 || params.getAll(field).length !== 1 || !isUuid(params.get(field) ?? "")) return failure("INVALID_INPUT", 400);
  const identifier = params.get(field)!;
  const scope = nativeRequestScope(request.signal);
  try {
    const actor = await scope.run(() => verifyNativeCredentials(request, config, scope.fetch, scope.unavailable));
    if (!actor) return failure("UNAUTHENTICATED", 401);
    const session = await scope.run(() => actor.client.rpc("native_session_v2", { p_action: "session" }).abortSignal(scope.signal));
    if (session.error) return failure(/UNAUTHENTICATED|SESSION_REPLACED/.test(session.error.message) ? "UNAUTHENTICATED" : "RESULT_UNAVAILABLE", /UNAUTHENTICATED|SESSION_REPLACED/.test(session.error.message) ? 401 : 503);
    if (session.data?.subject !== actor.subject || session.data?.sessionId !== actor.sessionId) return failure("UNAUTHENTICATED", 401);
    const result = await scope.run(() => actor.client.rpc(rpc, { [parameter]: identifier }).abortSignal(scope.signal));
    if (result.error) return failure("RESULT_UNAVAILABLE", 503);
    if (result.data?.kind === "empty" || result.data?.kind === "unavailable") return reply({ version: 1, data: { kind: result.data.kind } });
    const data = result.data;
    if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).length !== 4
      || data.kind !== "result_reference" || data[field] !== identifier || !isUuid(data.artifactId)
      || !Number.isSafeInteger(data.revision) || data.revision < 1 || data.revision > 1000) return failure("RESULT_UNAVAILABLE", 503);
    return reply({ version: 1, data });
  } catch { return failure("RESULT_UNAVAILABLE", 503); }
  finally { scope.dispose(); }
}
