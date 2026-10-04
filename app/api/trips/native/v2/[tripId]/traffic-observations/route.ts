import type { NextRequest } from "next/server";
import { foregroundTrafficHTTP } from "@/lib/server/maps/foreground-traffic/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, context: { params: Promise<{ tripId: string }> }) {
  return foregroundTrafficHTTP(request, (await context.params).tripId, true);
}
