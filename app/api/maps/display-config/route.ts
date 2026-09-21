import { NextResponse, type NextRequest } from "next/server";
import { requireAuthenticatedActor } from "@/lib/server/maps/web-auth";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!await requireAuthenticatedActor(request)) return NextResponse.json({ enabled: false }, { status: 401, headers });
  const key = process.env.AMAP_JS_DISPLAY_KEY;
  return NextResponse.json(key && process.env.AMAP_JS_SECURITY_CODE
    ? { enabled: true, key, serviceHost: "/api/maps/_AMapService" }
    : { enabled: false }, { headers });
}
