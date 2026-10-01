import type { NextRequest } from "next/server";
import { nativeAssistantTaskActivityHTTP } from "@/lib/server/turn/native-assistant-task-activity-http";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ conversationId: string; taskId: string }> }) {
  const { conversationId, taskId } = await context.params;
  return nativeAssistantTaskActivityHTTP(request, conversationId, taskId);
}
