import type { NextRequest } from "next/server";
import { guideHTTP } from "@/lib/server/guide/http";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  return guideHTTP(request, (await params).tripId, false);
}
