import { getNativeRuntimeConfig } from "../identity/native-config.ts";
import { verifyNativeCredentials } from "../identity/native-credentials.ts";
import { nativeRequestScope } from "../identity/native-request.ts";
import { isUuid } from "../identity/request-guards.ts";
import { parseResultSearchPage } from "./result-search-contract.ts";

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const failure = (code: string, status: number) => reply({ error: { code } }, status);

export async function nativeResultSearchHTTP(request: Request): Promise<Response> {
  const config = getNativeRuntimeConfig(request, "session");
  if (!config) return failure("RESULT_UNAVAILABLE", 503);
  const params = new URL(request.url).searchParams;
  const query = params.get("query") ?? "", cursor = params.get("cursor");
  if (request.method !== "GET" || request.headers.has("cookie") || request.headers.has("origin")
    || [...params.keys()].some(k => !["query", "cursor"].includes(k))
    || params.getAll("query").length > 1 || params.getAll("cursor").length > 1
    || query.length > 120 || cursor !== null && !isUuid(cursor)) return failure("INVALID_INPUT", 400);
  const scope = nativeRequestScope(request.signal);
  try {
    const actor = await scope.run(() => verifyNativeCredentials(request, config, scope.fetch, scope.unavailable));
    if (!actor) return failure("UNAUTHENTICATED", 401);
    const session = await scope.run(() => actor.client.rpc("native_session_v2", { p_action: "session" }).abortSignal(scope.signal));
    if (session.error) return failure(/UNAUTHENTICATED|SESSION_REPLACED/.test(session.error.message) ? "UNAUTHENTICATED" : "RESULT_UNAVAILABLE",
      /UNAUTHENTICATED|SESSION_REPLACED/.test(session.error.message) ? 401 : 503);
    if (session.data?.subject !== actor.subject || session.data?.sessionId !== actor.sessionId) return failure("UNAUTHENTICATED", 401);
    const result = await scope.run(() => actor.client.rpc("search_result_artifacts_v1", { p_query: query, p_cursor: cursor }).abortSignal(scope.signal));
    if (result.error) return failure("RESULT_UNAVAILABLE", 503);
    if (result.data?.kind === "unavailable") return reply({ version: 1, data: { kind: "unavailable" } });
    const page = parseResultSearchPage(result.data);
    return page ? reply({ version: 1, data: page }) : failure("RESULT_UNAVAILABLE", 503);
  } catch { return failure("RESULT_UNAVAILABLE", 503); }
  finally { scope.dispose(); }
}
