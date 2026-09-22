import type { NextRequest } from "next/server";
import { nativeTripHTTP } from "@/lib/server/trip/native-http";

export const runtime = "nodejs";
export async function GET(request: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  return nativeTripHTTP(request, "archive_read", (await params).tripId);
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  return nativeTripHTTP(request, "archive", (await params).tripId);
}
