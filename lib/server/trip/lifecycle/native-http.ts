import { getNativeRuntimeConfig, nativeTargetAllowed, type NativeConfig } from "../../identity/native-config.ts";
import { verifyNativeCredentials } from "../../identity/native-credentials.ts";
import { nativeRequestScope } from "../../identity/native-request.ts";
import { lifecycleOperations, lifecycleError, type LifecycleResult, type LifecycleActor } from "./operations.ts";
import { record, uuid } from "./contract.ts";
import { lifecyclePageInput, lifecycleBody, lifecycleStatus, lifecycleRawBody } from "./http-input.ts";

type Action = "read" | "execute" | "recover" | "abandon";
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = (code: string) => reply({ error: { code } }, lifecycleStatus(code));

export async function nativeTripLifecycleHTTP(request: Request, action: Action, operationId?: string,
  config: NativeConfig | null = getNativeRuntimeConfig(request, "trip", "trip")): Promise<Response> {
  if (!config || !nativeTargetAllowed(config, request)) return fail("UNAVAILABLE");
  if (request.headers.has("cookie") || request.headers.has("origin")) return fail("INVALID_INPUT");
  if (request.method !== (["execute", "abandon"].includes(action) ? "POST" : "GET")) return fail("INVALID_INPUT");
  const params = new URL(request.url).searchParams;
  const page = action === "read" ? lifecyclePageInput(params) : null;
  if (action === "read" ? page === null || operationId !== undefined : [...params].length > 0
    || (action === "execute" ? operationId !== undefined : !uuid(operationId))) return fail("INVALID_INPUT");
  const scope = nativeRequestScope(request.signal);
  try {
    let bytes: string | null = null;
    if (["execute", "abandon"].includes(action)) {
      if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return fail("INVALID_INPUT");
      bytes = await lifecycleRawBody(request, scope);
      const command = lifecycleBody(bytes);
      if (!command || action === "abandon" && command.operationId !== operationId) return fail("INVALID_INPUT");
    }
    const credentials = await scope.run(() => verifyNativeCredentials(request, config, scope.fetch, scope.unavailable));
    scope.check();
    if (!credentials) return fail("UNAUTHENTICATED");
    const authenticated = async (): Promise<LifecycleResult<LifecycleActor>> => {
      const r = await scope.run(() => credentials.client.rpc("native_session_v2", { p_action: "session" }).abortSignal(scope.signal));
      if (r.error) return { error: lifecycleError(r.error.message) };
      if (!record(r.data) || !uuid(r.data.subject) || !uuid(r.data.sessionId)) return { error: "UNAVAILABLE" };
      return r.data.subject === credentials.subject && r.data.sessionId === credentials.sessionId
        ? { data: { ownerId: credentials.subject, sessionId: credentials.sessionId } } : { error: "SESSION_REPLACED" };
    };
    const adapter = lifecycleOperations(async (a, input, raw) => {
      const r = await scope.run(() => credentials.client.rpc("trip_lifecycle_v1", { p_action: a, p_input: input, p_request_bytes: raw }).abortSignal(scope.signal));
      return r.error ? { error: lifecycleError(r.error.message) } : { data: r.data };
    }, authenticated);
    const result = action === "read" ? await adapter.readLifecycle(page ?? {})
      : action === "recover" ? await adapter.recoverLifecycle(operationId!)
      : await adapter.mutateLifecycle(lifecycleBody(bytes)!, bytes!, action === "abandon");
    scope.check();
    return "error" in result ? fail(result.error) : reply(result.data);
  } catch { return fail("UNAVAILABLE"); }
  finally { scope.dispose(); }
}
