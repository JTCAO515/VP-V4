import type { NextRequest } from "next/server";
import { nativeQaHTTP } from "../../../../../../../../lib/server/qa-agent/native-http.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return nativeQaHTTP(request, "submit", sessionId);
}
