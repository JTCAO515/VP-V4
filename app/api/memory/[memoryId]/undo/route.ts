import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { failureResponse } from "@/lib/server/identity/failure-response";
import { createUserDataAdapter } from "@/lib/server/identity/user-data-adapter";
import { isMemoryCreateUndoInput, isSameOriginMutation, isUuid } from "@/lib/server/identity/request-guards";

export async function POST(request: NextRequest, { params }: { params: Promise<{ memoryId: string }> }) {
  const { memoryId } = await params;
  if (!isUuid(memoryId) || !isSameOriginMutation(request))
    return NextResponse.json(failureResponse("FORBIDDEN"), { status: 403 });
  let input: unknown;
  try { input = await request.json(); }
  catch { return NextResponse.json(failureResponse("INVALID_INPUT"), { status: 400 }); }
  if (!isMemoryCreateUndoInput(input))
    return NextResponse.json(failureResponse("INVALID_INPUT"), { status: 400 });
  const adapter = createUserDataAdapter(request);
  if (!adapter) return NextResponse.json(failureResponse("PROVIDER_UNAVAILABLE"), { status: 503 });
  const result = await adapter.undoExplicitMemoryCreate(memoryId, input);
  if ("error" in result) {
    const failure = failureResponse(result.error);
    return adapter.applyCookies(NextResponse.json(failure, { status: failure.status, headers: { "Cache-Control": "private, no-store" } }));
  }
  return adapter.applyCookies(NextResponse.json(result.data, { headers: { "Cache-Control": "private, no-store" } }));
}
