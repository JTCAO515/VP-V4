import type { NextRequest } from "next/server";
import { nativeTripChangeProposalReferenceHTTP } from "@/lib/server/artifacts/native-proposal-reference-discovery-http";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  return nativeTripChangeProposalReferenceHTTP(request);
}
