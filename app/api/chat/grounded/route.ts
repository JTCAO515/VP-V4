import { NextRequest, NextResponse } from "next/server";
import { createUserDataAdapter } from "@/lib/server/identity/user-data-adapter";
import { nativeRequestScope } from "@/lib/server/identity/native-request";
import { getNativeTextConfig } from "@/lib/server/turn/native-http";
import { parseGroundedHistory } from "@/lib/grounded/read-model";

export const dynamic = "force-dynamic";

/** Cookie identity only. The deployment selects one existing policy; this route cannot submit work. */
export async function GET(request: NextRequest) {
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } });
  const origin = request.headers.get("origin");
  if (request.headers.has("authorization") || request.nextUrl.searchParams.size || (origin !== null && origin !== request.nextUrl.origin)
    || request.headers.get("sec-fetch-site") === "cross-site") return reply({ error: "INVALID_INPUT" }, 400);
  const config = process.env.VISEPANDA_GROUNDED_WEB_READ === "true" ? getNativeTextConfig(request, "grounded") : null;
  if (!config) return reply({ error: "UNAVAILABLE" }, 503);
  const scope = nativeRequestScope(request.signal), started = performance.now();
  const adapter = createUserDataAdapter(request, config, scope.fetch);
  if (!adapter) { scope.dispose(); return reply({ error: "UNAVAILABLE" }, 503); }
  try {
    const result = await scope.run(() => adapter.readGroundedHistory(config.policyId));
    if (result.error || !result.data) return adapter.applyCookies(reply({ error: result.error === "UNAUTHENTICATED" ? "UNAUTHENTICATED" : "UNAVAILABLE" }, result.error === "UNAUTHENTICATED" ? 401 : 503));
    const data = parseGroundedHistory(result.data.ownerId, result.data.policy, result.data.history, config.policyId, performance.now() - started);
    scope.check();
    return adapter.applyCookies(reply({ data }));
  } catch { return adapter.applyCookies(reply({ error: "UNAVAILABLE" }, 503)); }
  finally { scope.dispose(); }
}
