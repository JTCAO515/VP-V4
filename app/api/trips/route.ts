import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { failureResponse } from "@/lib/server/identity/failure-response";
import { createUserDataAdapter } from "@/lib/server/identity/user-data-adapter";
import {
  isSameOriginMutation,
  isTripCreateInput,
  parseTripListInput,
} from "@/lib/server/identity/request-guards";

const privateNoStore = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  const input = parseTripListInput(request.nextUrl.searchParams);
  if (!input)
    return NextResponse.json(failureResponse("INVALID_INPUT"), { status: 400 });
  const adapter = createUserDataAdapter(request);
  if (!adapter)
    return NextResponse.json(failureResponse("PROVIDER_UNAVAILABLE"), {
      status: 503,
    });
  const result = await adapter.listTrips(input.limit);
  if ("error" in result) {
    const failure = failureResponse(result.error);
    return adapter.applyCookies(
      NextResponse.json(failure, { status: failure.status }),
    );
  }
  return adapter.applyCookies(
    NextResponse.json(
      {
        trips: result.data,
        currentTripId: result.data[0]?.id ?? null,
      },
      { headers: privateNoStore },
    ),
  );
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request))
    return NextResponse.json(failureResponse("FORBIDDEN"), { status: 403 });
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json(failureResponse("INVALID_INPUT"), { status: 400 });
  }
  if (!isTripCreateInput(input))
    return NextResponse.json(failureResponse("INVALID_INPUT"), { status: 400 });
  const adapter = createUserDataAdapter(request);
  if (!adapter)
    return NextResponse.json(failureResponse("PROVIDER_UNAVAILABLE"), {
      status: 503,
    });
  const result = await adapter.createTrip(input);
  if ("error" in result) {
    const failure = failureResponse(result.error);
    return adapter.applyCookies(
      NextResponse.json(failure, { status: failure.status }),
    );
  }
  return adapter.applyCookies(
    NextResponse.json(result.data, {
      status: result.data.reused ? 200 : 201,
      headers: privateNoStore,
    }),
  );
}
