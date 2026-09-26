import type { NextRequest } from "next/server";
import { nativeAssistantTripPrivacyHTTP } from "@/lib/server/turn/native-assistant-trip-http";

export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ afterGoalId: string }> }) {
  return nativeAssistantTripPrivacyHTTP(request, (await context.params).afterGoalId);
}
