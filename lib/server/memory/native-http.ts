import { getNativeRuntimeConfig, nativeTargetAllowed, type NativeConfig } from "../identity/native-config.ts";
import { nativeRequestScope } from "../identity/native-request.ts";
import { verifyNativeCredentials } from "../identity/native-credentials.ts";
import { isTaskTravelPaceInput, isTravelPaceCommand } from "./travel-pace.ts";

const response = (value: unknown, status = 200) => Response.json(value, {
  status, headers: { "Cache-Control": "private, no-store" },
});
const failure = (code: string, status: number) => response({ error: { code } }, status);

/** Native bearer only. RPC rechecks and locks the actual mobile session/owner. */
export async function nativeTravelPaceHTTP(request: Request, action: "manage" | "project",
  config: NativeConfig | null = getNativeRuntimeConfig(request, "trip")): Promise<Response> {
  if (!config || !nativeTargetAllowed(config, request)) return failure("UNAVAILABLE", 503);
  if (request.headers.has("cookie") || request.headers.has("origin")) return failure("AMBIGUOUS_CREDENTIALS", 400);
  if ((action === "project" && request.method !== "POST")
    || (action === "manage" && !["GET", "POST"].includes(request.method))) return failure("METHOD_NOT_ALLOWED", 405);
  if (new URL(request.url).search) return failure("INVALID_INPUT", 400);
  const scope = nativeRequestScope(request.signal);
  try {
    let input: unknown = { action: "read" };
    if (request.method === "POST") {
      const body = await scope.body(request, 4096);
      if (!body) return failure("INVALID_INPUT", 400);
      try { input = JSON.parse(body); } catch { return failure("INVALID_INPUT", 400); }
      if (!(action === "project" ? isTaskTravelPaceInput(input) : isTravelPaceCommand(input))) return failure("INVALID_INPUT", 400);
    }
    const actor = await scope.run(() => verifyNativeCredentials(request, config, scope.fetch, scope.unavailable));
    if (!actor) return failure("UNAUTHENTICATED", 401);
    const result = await scope.run(() => actor.client.rpc(action === "project"
      ? "native_task_travel_pace_v1" : "native_travel_pace_v1", { p_input: input }).abortSignal(scope.signal));
    scope.check();
    if (result.error) {
      const code = result.error.message;
      if (["PACE_CONFLICT", "PACE_OPERATION_REUSE", "PACE_STALE_SOURCE"].includes(code)) return failure(code, 409);
      if (["UNAUTHENTICATED", "SESSION_REPLACED"].includes(code)) return failure(code, 401);
      if (code === "FORBIDDEN") return failure(code, 403);
      if (code === "INVALID_INPUT") return failure(code, 400);
      return failure("UNAVAILABLE", 503);
    }
    return response(result.data);
  } catch { return failure("UNAVAILABLE", 503); }
  finally { scope.dispose(); }
}
