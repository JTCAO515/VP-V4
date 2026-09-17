import { NextResponse, type NextRequest } from "next/server";
import { reverseGeocode } from "@/lib/server/maps/provider-reverse-geocode-adapter";
import type { Provider } from "@/lib/server/maps/place-identity";
import { getNativeRuntimeConfig } from "@/lib/server/identity/native-config";
import { verifyNativeCredentials } from "@/lib/server/identity/native-credentials";
import { nativeRequestScope } from "@/lib/server/identity/native-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const provider = (value: string | null): value is Provider => value === "amap" || value === "tencent";
const number = (value: string | null): number | null => value !== null && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null;

export async function GET(request: NextRequest) {
  const config = getNativeRuntimeConfig(request, "session");
  if (!config || request.headers.has("cookie") || request.headers.has("origin")) return reply({ error: { code: "UNAUTHENTICATED" } }, 401);
  const selectedProvider = request.nextUrl.searchParams.get("provider");
  const lat = number(request.nextUrl.searchParams.get("lat"));
  const lng = number(request.nextUrl.searchParams.get("lng"));
  const system = request.nextUrl.searchParams.get("system");
  if (!provider(selectedProvider) || lat === null || lng === null || system !== "gcj02") return reply({ error: { code: "INVALID_INPUT" } }, 400);
  const scope = nativeRequestScope(request.signal);
  try {
    return await scope.run(async () => {
      const credentials = await verifyNativeCredentials(request, config, scope.fetch, scope.unavailable); scope.check();
      if (!credentials) return reply({ error: { code: "UNAUTHENTICATED" } }, 401);
      const session = await credentials.client.rpc("native_session_v2", { p_action: "session" }).abortSignal(scope.signal); scope.check();
      if (session.error || session.data?.subject !== credentials.subject || session.data?.sessionId !== credentials.sessionId) return reply({ error: { code: "SESSION_REPLACED" } }, 401);
      const outcome = await reverseGeocode({ provider: selectedProvider, location: { lat, lng, system }, env: process.env, fetcher: scope.fetch }); scope.check();
      if (outcome.status === "observed") return reply({ result: outcome.result });
      if (outcome.status === "not_found") return reply({ result: null });
      if (outcome.status === "UNRUN") return reply({ error: { code: "PROVIDER_UNAVAILABLE" }, reason: outcome.reason }, 503);
      return reply({ error: { code: outcome.status === "timeout" ? "TIMEOUT_BEFORE_OUTPUT" : "PROVIDER_UNAVAILABLE" } }, 503);
    });
  } catch { return reply({ error: { code: "PROVIDER_UNAVAILABLE" } }, 503); }
  finally { scope.dispose(); }
}
