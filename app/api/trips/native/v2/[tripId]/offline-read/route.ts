import type { NextRequest } from "next/server";
import { nativeOfflineReadHTTP } from "@/lib/server/today/offline-native-http";

export const runtime = "nodejs";
export const maxDuration = 90;
export async function GET(request: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return nativeOfflineReadHTTP(request, tripId);
}
