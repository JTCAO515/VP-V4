import { NextResponse, type NextRequest } from "next/server";
import { requireAuthenticatedActor } from "@/lib/server/maps/web-auth";
import { enforcePlaceQuota } from "@/lib/server/maps/place-quota";
import { createMapsServiceRoleClient } from "@/lib/server/maps/service-role-client";
import { lookupPlace } from "@/lib/server/maps/place-lookup";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: NextRequest) {
  const actor = await requireAuthenticatedActor(request);
  if (!actor) return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401, headers });
  // Per-actor provider quota before any provider call; fail-closed.
  const quotaRejection = await enforcePlaceQuota(actor.client, "places", request.signal);
  if (quotaRejection) return quotaRejection;
  try {
    const result = await lookupPlace(request.nextUrl.searchParams, { env: process.env, serviceClient: createMapsServiceRoleClient(), fetcher: (url, init) => fetch(url, { ...init, signal: AbortSignal.any([request.signal, ...(init?.signal ? [init.signal] : [])]) }) });
    return NextResponse.json(result.body, { status: result.status, headers });
  } catch { return NextResponse.json({ error: { code: "PROVIDER_UNAVAILABLE" } }, { status: 503, headers }); }
}
