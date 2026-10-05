import { NextResponse, type NextRequest } from "next/server";
import { createUserDataAdapter } from "../../identity/user-data-adapter.ts";
import { isSameOriginMutation } from "../../identity/request-guards.ts";
import { nativeRequestScope } from "../../identity/native-request.ts";
import { lifecyclePageInput, lifecycleBody, lifecycleStatus, lifecycleRawBody } from "./http-input.ts";
import { uuid } from "./contract.ts";
import type { LifecycleResult } from "./operations.ts";

const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = (code: string) => reply({ error: { code } }, lifecycleStatus(code));

/** Cookie adapter and accepted same-origin policy; never converts bearer to cookie. */
export async function webTripLifecycleHTTP(request: NextRequest, action: "read" | "execute" | "recover" | "abandon", operationId?: string) {
  if (request.headers.has("authorization")) return fail("INVALID_INPUT");
  const mutation = ["execute", "abandon"].includes(action);
  if (request.method !== (mutation ? "POST" : "GET")) return fail("INVALID_INPUT");
  if (mutation && !isSameOriginMutation(request)) return fail("FORBIDDEN");
  const page = action === "read" ? lifecyclePageInput(request.nextUrl.searchParams) : null;
  if (action === "read" ? page === null || operationId !== undefined : [...request.nextUrl.searchParams].length > 0
    || (action === "execute" ? operationId !== undefined : !uuid(operationId))) return fail("INVALID_INPUT");
  const scope = nativeRequestScope(request.signal);
  try {
    let bytes: string | null = null;
    if (mutation) {
      if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return fail("INVALID_INPUT");
      bytes = await lifecycleRawBody(request, scope);
      const command = lifecycleBody(bytes);
      if (!command || action === "abandon" && command.operationId !== operationId) return fail("INVALID_INPUT");
    }
    const adapter = createUserDataAdapter(request, undefined, scope.fetch);
    if (!adapter) return fail("UNAVAILABLE");
    const result = await scope.run<LifecycleResult<unknown>>(() => action === "read" ? adapter.readLifecycle(page ?? {})
      : action === "recover" ? adapter.recoverLifecycle(operationId!)
      : adapter.mutateLifecycle(lifecycleBody(bytes)!, bytes!, action === "abandon"));
    scope.check();
    return adapter.applyCookies("error" in result ? fail(result.error) : reply(result.data));
  } catch { return fail("UNAVAILABLE"); }
  finally { scope.dispose(); }
}
