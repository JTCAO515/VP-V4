import type { NextRequest } from "next/server";
import { qaAgentHTTP } from "@/lib/server/qa-agent/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionId: string; requestId: string }> }) {
  const { sessionId, requestId } = await params;
  return qaAgentHTTP(request, "message", sessionId, requestId);
}
