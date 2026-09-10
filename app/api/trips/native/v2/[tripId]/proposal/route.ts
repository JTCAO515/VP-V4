import type { NextRequest } from "next/server";
import { nativeTripHTTP } from "@/lib/server/trip/native-http";

export const runtime = "nodejs";
export async function GET(request: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return nativeTripHTTP(request, "proposal_read", tripId);
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return nativeTripHTTP(request, "proposal_create", tripId);
}
