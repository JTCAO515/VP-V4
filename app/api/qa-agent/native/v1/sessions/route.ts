import type { NextRequest } from "next/server";
import { nativeQaHTTP } from "../../../../../../lib/server/qa-agent/native-http.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  return nativeQaHTTP(request, "list");
}
export async function POST(request: NextRequest) {
  return nativeQaHTTP(request, "create");
}
