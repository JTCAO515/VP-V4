import type { NextRequest } from "next/server";
import { nativeAssistantTripHTTP } from "@/lib/server/turn/native-assistant-trip-http";

export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ goalId: string }> }) {
  return nativeAssistantTripHTTP(request, (await context.params).goalId);
}
export async function POST(request: NextRequest, context: { params: Promise<{ goalId: string }> }) {
  return nativeAssistantTripHTTP(request, (await context.params).goalId);
}
