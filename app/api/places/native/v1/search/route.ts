import { NextResponse, type NextRequest } from "next/server";
import { createMapsServiceRoleClient } from "@/lib/server/maps/service-role-client";
import { searchPlacesWithCanonicalMapping } from "@/lib/server/maps/place-consumer";
import type { Provider } from "@/lib/server/maps/place-identity";
import { getNativeRuntimeConfig } from "@/lib/server/identity/native-config";
import { verifyNativeCredentials } from "@/lib/server/identity/native-credentials";
import { nativeRequestScope } from "@/lib/server/identity/native-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isProvider = (value: string | null): value is Provider => value === "amap" || value === "tencent";
const boundedText = (value: string | null, max: number): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: NextRequest) {
  const config = getNativeRuntimeConfig(request, "session");
  if (!config || request.headers.has("cookie") || request.headers.has("origin")) return reply({ error: { code: "UNAUTHENTICATED" } }, 401);
  const provider = request.nextUrl.searchParams.get("provider");
  const query = request.nextUrl.searchParams.get("q");
  const city = request.nextUrl.searchParams.get("city");
  if (!isProvider(provider) || !boundedText(query, 200) || !boundedText(city, 100)) return reply({ error: { code: "INVALID_INPUT" } }, 400);
  const scope = nativeRequestScope(request.signal);
  try {
    return await scope.run(async () => {
      const credentials = await verifyNativeCredentials(request, config, scope.fetch, scope.unavailable);
      scope.check();
      if (!credentials) return reply({ error: { code: "UNAUTHENTICATED" } }, 401);
      const session = await credentials.client.rpc("native_session_v2", { p_action: "session" }).abortSignal(scope.signal);
      scope.check();
      if (session.error || session.data?.subject !== credentials.subject || session.data?.sessionId !== credentials.sessionId) return reply({ error: { code: "SESSION_REPLACED" } }, 401);
      const outcome = await searchPlacesWithCanonicalMapping({ provider, query, city, env: process.env, serviceClient: createMapsServiceRoleClient(), fetcher: scope.fetch });
      scope.check();
      if (outcome.status === "observed") return reply({ candidates: outcome.candidates });
      if (outcome.status === "no_results") return reply({ candidates: [] });
      if (outcome.status === "UNRUN") return reply({ error: { code: "PROVIDER_UNAVAILABLE" }, reason: outcome.reason }, 503);
      return reply({ error: { code: outcome.status === "timeout" ? "TIMEOUT_BEFORE_OUTPUT" : "PROVIDER_UNAVAILABLE" } }, 503);
    });
  } catch { return reply({ error: { code: "PROVIDER_UNAVAILABLE" } }, 503); }
  finally { scope.dispose(); }
}
