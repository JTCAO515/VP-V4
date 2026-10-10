import type { NextRequest } from "next/server";
import { nativeAssistantEventsHTTP } from "@/lib/server/turn/assistant-events/http";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await context.params;
  return nativeAssistantEventsHTTP(request, conversationId);
}
