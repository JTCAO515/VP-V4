import { placeActionHTTP } from "@/lib/server/explore/place-action-http";
import type { NextRequest } from "next/server";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  return placeActionHTTP(request, (await params).tripId, false);
}
