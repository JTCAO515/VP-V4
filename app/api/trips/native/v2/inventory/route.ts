import type { NextRequest } from "next/server";
import { nativeTripInventoryHTTP } from "@/lib/server/trip/inventory/http";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  return nativeTripInventoryHTTP(request);
}
