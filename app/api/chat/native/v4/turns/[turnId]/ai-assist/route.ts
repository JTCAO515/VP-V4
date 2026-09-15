import type { NextRequest } from "next/server";
import { nativeGroundedAiAssist } from "@/lib/server/turn/native-ai-assist-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, context: { params: Promise<{ turnId: string }> }) {
  return nativeGroundedAiAssist(request, (await context.params).turnId);
}
