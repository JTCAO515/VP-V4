import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { failureResponse } from "@/lib/server/identity/failure-response";
import { createUserDataAdapter } from "@/lib/server/identity/user-data-adapter";
import {
  isPrivacyRequestInput,
  isSameOriginMutation,
} from "@/lib/server/identity/request-guards";
import { normalizePrivacyRequest } from "@/lib/server/privacy/contract";

export async function GET(request: NextRequest) {
  const adapter = createUserDataAdapter(request);
  if (!adapter)
    return NextResponse.json(failureResponse("PROVIDER_UNAVAILABLE"), {
      status: 503,
    });
  const result = await adapter.listPrivacyRequests();
  if ("error" in result) {
    const failure = failureResponse(result.error);
    return adapter.applyCookies(
      NextResponse.json(failure, { status: failure.status }),
    );
  }
  return adapter.applyCookies(
    NextResponse.json(result.data, {
      headers: { "Cache-Control": "private, no-store" },
    }),
  );
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request))
    return NextResponse.json(failureResponse("FORBIDDEN"), { status: 403 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(failureResponse("INVALID_INPUT"), { status: 400 });
  }
  if (!isPrivacyRequestInput(body))
    return NextResponse.json(failureResponse("INVALID_INPUT"), { status: 400 });
  const input = normalizePrivacyRequest(body);
  if (!input)
    return NextResponse.json(failureResponse("INVALID_INPUT"), { status: 400 });
  const adapter = createUserDataAdapter(request);
  if (!adapter)
    return NextResponse.json(failureResponse("PROVIDER_UNAVAILABLE"), {
      status: 503,
    });
  const result = await adapter.requestPrivacyAction(input);
  if ("error" in result) {
    const failure = failureResponse(result.error);
    return adapter.applyCookies(
      NextResponse.json(failure, { status: failure.status }),
    );
  }
  return adapter.applyCookies(
    NextResponse.json(result.data, {
      status: 202,
      headers: { "Cache-Control": "private, no-store" },
    }),
  );
}
