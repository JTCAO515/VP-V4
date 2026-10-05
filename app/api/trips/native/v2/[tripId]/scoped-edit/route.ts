import type { NextRequest } from "next/server";
import { scopedTripEditHTTP } from "@/lib/server/trip/scoped-edit/http";
export async function POST(request: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  return scopedTripEditHTTP(request, (await params).tripId, true);
}
