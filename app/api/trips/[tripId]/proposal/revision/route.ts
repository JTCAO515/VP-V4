import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createUserDataAdapter } from "@/lib/server/identity/user-data-adapter";
import { failureResponse } from "@/lib/server/identity/failure-response";
import { isProposalRevisionInput, isSameOriginMutation, isUuid } from "@/lib/server/identity/request-guards";

export async function POST(request: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  if (!isUuid(tripId)) return NextResponse.json(failureResponse("INVALID_INPUT"), { status: 400 });
  if (!isSameOriginMutation(request)) return NextResponse.json(failureResponse("FORBIDDEN"), { status: 403 });
  let input: unknown;
  try { input = await request.json(); } catch { return NextResponse.json(failureResponse("INVALID_INPUT"), { status: 400 }); }
  if (!isProposalRevisionInput(input)) return NextResponse.json(failureResponse("INVALID_INPUT"), { status: 400 });
  const adapter = createUserDataAdapter(request);
  if (!adapter) return NextResponse.json(failureResponse("PROVIDER_UNAVAILABLE"), { status: 503 });
  const result = await adapter.revisePendingProposal(tripId, input);
  if ("error" in result) {
    const failure = failureResponse(result.error);
    return adapter.applyCookies(NextResponse.json(failure, { status: failure.status }));
  }
  return adapter.applyCookies(NextResponse.json(result.data, { status: 201, headers: { "Cache-Control": "private, no-store" } }));
}
