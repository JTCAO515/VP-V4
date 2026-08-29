import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { failureResponse } from "@/lib/server/identity/failure-response";
import { createUserDataAdapter } from "@/lib/server/identity/user-data-adapter";
import { isUuid } from "@/lib/server/identity/request-guards";
import { TURN_SSE_CONTENT_TYPE, TurnSseReplayError, encodeTurnSseReplay, resolveTurnReplayCursor } from "@/lib/server/turn/sse-replay";

export async function GET(request: NextRequest, { params }: { params: Promise<{ turnId: string }> }) {
  const { turnId } = await params;
  let afterSequence: number;
  try {
    afterSequence = resolveTurnReplayCursor({
      afterSequence: request.nextUrl.searchParams.get("afterSequence"),
      lastEventId: request.headers.get("Last-Event-ID"),
    });
  } catch (error) {
    if (error instanceof TurnSseReplayError) return NextResponse.json(failureResponse("INVALID_INPUT"), { status: 400 });
    throw error;
  }
  if (!isUuid(turnId)) return NextResponse.json(failureResponse("INVALID_INPUT"), { status: 400 });
  const adapter = createUserDataAdapter(request);
  if (!adapter) return NextResponse.json(failureResponse("PROVIDER_UNAVAILABLE"), { status: 503 });
  const result = await adapter.replayChatTurn(turnId, afterSequence);
  if ("error" in result) {
    const failure = failureResponse(result.error);
    return adapter.applyCookies(NextResponse.json(failure, { status: failure.status }));
  }
  try {
    const body = encodeTurnSseReplay(turnId, result.data.map((event) => ({ eventId: event.eventId, sequence: event.sequence, type: event.type, state: event.state })));
    return adapter.applyCookies(new NextResponse(body, { headers: { "Cache-Control": "private, no-store", "Content-Type": TURN_SSE_CONTENT_TYPE, "X-Accel-Buffering": "no" } }));
  } catch (error) {
    if (error instanceof TurnSseReplayError) return adapter.applyCookies(NextResponse.json(failureResponse("INTERNAL_ERROR"), { status: 500 }));
    throw error;
  }
}
