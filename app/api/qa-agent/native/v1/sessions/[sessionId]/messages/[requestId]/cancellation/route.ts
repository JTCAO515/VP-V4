import type { NextRequest } from "next/server";
import { nativeQaCancellationHTTP } from "../../../../../../../../../../lib/server/qa-agent/native-http.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionId: string; requestId: string }> }) {
  const { sessionId, requestId } = await params;
  return nativeQaCancellationHTTP(request, sessionId, requestId);
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string; requestId: string }> }) {
  const { sessionId, requestId } = await params;
  return nativeQaCancellationHTTP(request, sessionId, requestId);
}
