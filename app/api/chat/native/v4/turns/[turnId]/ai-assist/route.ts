import type { NextRequest } from "next/server";
import { nativeGroundedAiAssist } from "@/lib/server/turn/native-ai-assist-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The 75s request scope in native-ai-assist-http.ts must finish before this 90s limit.
export const maxDuration = 90;
export async function POST(request: NextRequest, context: { params: Promise<{ turnId: string }> }) {
  return nativeGroundedAiAssist(request, (await context.params).turnId);
}
