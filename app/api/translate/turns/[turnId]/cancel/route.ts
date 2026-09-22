import type { NextRequest } from "next/server";
import { nativeTextHTTP } from "@/lib/server/turn/native-http";
export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ turnId: string }> }) {
  return nativeTextHTTP(request, "cancel", (await context.params).turnId);
}
