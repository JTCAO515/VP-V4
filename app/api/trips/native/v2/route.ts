import type { NextRequest } from "next/server";
import { nativeTripHTTP } from "@/lib/server/trip/native-http";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  return nativeTripHTTP(request, "list");
}
export async function POST(request: NextRequest) {
  return nativeTripHTTP(request, "create");
}
