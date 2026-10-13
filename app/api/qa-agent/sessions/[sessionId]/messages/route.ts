import type { NextRequest } from "next/server";
import { qaAgentHTTP } from "@/lib/server/qa-agent/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return qaAgentHTTP(request, "submit", sessionId);
}
