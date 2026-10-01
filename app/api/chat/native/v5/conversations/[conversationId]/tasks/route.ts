import type { NextRequest } from "next/server";
import { nativeAssistantTasksHTTP } from "@/lib/server/turn/native-assistant-tasks-http";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await context.params;
  return nativeAssistantTasksHTTP(request, conversationId);
}
