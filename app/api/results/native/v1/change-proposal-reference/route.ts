import type { NextRequest } from "next/server";
import { nativeChangeProposalReferenceHTTP } from "@/lib/server/artifacts/native-result-http";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  return nativeChangeProposalReferenceHTTP(request);
}
