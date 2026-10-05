import type { NextRequest } from "next/server";
import { webTripLifecycleHTTP } from "@/lib/server/trip/lifecycle/web-http";
export const runtime = "nodejs";
export async function POST(request: NextRequest, { params }: { params: Promise<{ operationId: string }> }) {
  return webTripLifecycleHTTP(request, "abandon", (await params).operationId);
}
