import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { failureResponse } from "@/lib/server/identity/failure-response";
import { createUserDataAdapter } from "@/lib/server/identity/user-data-adapter";
import { isUuid } from "@/lib/server/identity/request-guards";

export async function GET(request: NextRequest, { params }: { params: Promise<{ turnId: string }> }) {
  const { turnId } = await params;
  const afterSequence = Number(request.nextUrl.searchParams.get("afterSequence") ?? "0");
  if (!isUuid(turnId) || !Number.isSafeInteger(afterSequence) || afterSequence < 0) return NextResponse.json(failureResponse("INVALID_INPUT"), { status: 400 });
  const adapter = createUserDataAdapter(request);
  if (!adapter) return NextResponse.json(failureResponse("PROVIDER_UNAVAILABLE"), { status: 503 });
  const result = await adapter.replayChatTurn(turnId, afterSequence);
  if ("error" in result) {
    const failure = failureResponse(result.error);
    return adapter.applyCookies(NextResponse.json(failure, { status: failure.status }));
  }
  return adapter.applyCookies(NextResponse.json(result.data, { headers: { "Cache-Control": "private, no-store" } }));
}
