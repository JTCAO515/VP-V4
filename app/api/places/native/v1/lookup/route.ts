import { NextResponse, type NextRequest } from "next/server";
import { createMapsServiceRoleClient } from "@/lib/server/maps/service-role-client";
import { lookupPlace } from "@/lib/server/maps/place-lookup";
import { getNativeRuntimeConfig } from "@/lib/server/identity/native-config";
import { verifyNativeCredentials } from "@/lib/server/identity/native-credentials";
import { nativeRequestScope } from "@/lib/server/identity/native-request";
import { enforcePlaceQuota } from "@/lib/server/maps/place-quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: NextRequest) {
  const config = getNativeRuntimeConfig(request, "session");
  if (!config || request.headers.has("cookie") || request.headers.has("origin")) return reply({ error: { code: "UNAUTHENTICATED" } }, 401);
  const scope = nativeRequestScope(request.signal);
  try {
    return await scope.run(async () => {
      const credentials = await verifyNativeCredentials(request, config, scope.fetch, scope.unavailable);
      scope.check();
      if (!credentials) return reply({ error: { code: "UNAUTHENTICATED" } }, 401);
      const session = await credentials.client.rpc("native_session_v2", { p_action: "session" }).abortSignal(scope.signal);
      scope.check();
      if (session.error || session.data?.subject !== credentials.subject || session.data?.sessionId !== credentials.sessionId) return reply({ error: { code: "SESSION_REPLACED" } }, 401);
      // Per-actor provider quota (auth.uid() of this JWT) before any provider call; fail-closed.
      const quotaRejection = await enforcePlaceQuota(credentials.client, "places", scope.signal); scope.check();
      if (quotaRejection) return quotaRejection;
      const result = await lookupPlace(request.nextUrl.searchParams, { env: process.env, serviceClient: createMapsServiceRoleClient(), fetcher: scope.fetch });
      scope.check();
      return reply(result.body, result.status);
    });
  } catch { return reply({ error: { code: "PROVIDER_UNAVAILABLE" } }, 503); }
  finally { scope.dispose(); }
}
