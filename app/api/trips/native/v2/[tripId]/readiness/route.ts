import type { NextRequest } from "next/server";
import { readinessHTTP } from "@/lib/server/readiness/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  return readinessHTTP(request, (await params).tripId, true);
}
