import type { NextRequest } from "next/server";
import { nativeGroundedEvents } from "@/lib/server/turn/native-events-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, context: { params: Promise<{ turnId: string }> }) {
  return nativeGroundedEvents(request, (await context.params).turnId);
}
