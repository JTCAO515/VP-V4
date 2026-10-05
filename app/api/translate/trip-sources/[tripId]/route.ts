import type { NextRequest } from "next/server";
import { tripTranslationSourceHTTP } from "@/lib/server/media-translation/text/trip-source-http";
export const runtime = "nodejs";
export async function GET(request: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return tripTranslationSourceHTTP(request, tripId);
}
