import type { NextRequest } from "next/server";
import { nativeOfflineTextHTTP } from "@/lib/server/today/offline-text-native-http";
export const runtime = "nodejs";
export const maxDuration = 90;
export async function POST(request: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return nativeOfflineTextHTTP(request, tripId, "revoke");
}
