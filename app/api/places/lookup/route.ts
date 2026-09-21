import { NextResponse, type NextRequest } from "next/server";
import { requireAuthenticatedActor } from "@/lib/server/maps/web-auth";
import { createMapsServiceRoleClient } from "@/lib/server/maps/service-role-client";
import { lookupPlace } from "@/lib/server/maps/place-lookup";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: NextRequest) {
  if (!await requireAuthenticatedActor(request)) return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401, headers });
  try {
    const result = await lookupPlace(request.nextUrl.searchParams, { env: process.env, serviceClient: createMapsServiceRoleClient(), fetcher: (url, init) => fetch(url, { ...init, signal: AbortSignal.any([request.signal, ...(init?.signal ? [init.signal] : [])]) }) });
    return NextResponse.json(result.body, { status: result.status, headers });
  } catch { return NextResponse.json({ error: { code: "PROVIDER_UNAVAILABLE" } }, { status: 503, headers }); }
}
