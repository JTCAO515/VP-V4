import type { NextRequest } from "next/server";
import { localRecoveryHTTP } from "@/lib/server/today/recovery/http";
export const runtime = "nodejs";
export async function POST(request: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  return localRecoveryHTTP(request, (await params).tripId, false);
}
