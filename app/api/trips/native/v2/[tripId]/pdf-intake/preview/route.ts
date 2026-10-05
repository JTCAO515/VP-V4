import type { NextRequest } from "next/server";
import { nativePdfIntakeHTTP } from "@/lib/server/intake/pdf/native-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, context: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await context.params;
  return nativePdfIntakeHTTP(request, tripId, "preview");
}
