import type { NextRequest } from "next/server";
import { webTripResultHTTP } from "@/lib/server/artifacts/web-trip-result-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, context: { params: Promise<{ tripId: string }> }) {
  return webTripResultHTTP(request, (await context.params).tripId);
}
