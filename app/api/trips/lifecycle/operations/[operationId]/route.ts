import type { NextRequest } from "next/server";
import { webTripLifecycleHTTP } from "@/lib/server/trip/lifecycle/web-http";
export const runtime = "nodejs";
export async function GET(request: NextRequest, { params }: { params: Promise<{ operationId: string }> }) {
  return webTripLifecycleHTTP(request, "recover", (await params).operationId);
}
