import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedActor } from "@/lib/server/maps/web-auth";
import { createMapsServiceRoleClient } from "@/lib/server/maps/service-role-client";
import { nearbySearchWithCanonicalMapping } from "@/lib/server/maps/place-consumer";
import type { Provider } from "@/lib/server/maps/place-identity";
import { failureResponse } from "@/lib/server/identity/failure-response";
import type { NearbyCategory, NearbyOutcome } from "@/lib/server/maps/provider-nearby-adapter";

/**
 * Sibling of app/api/places/search/route.ts for #363's nearby-category
 * adapter -- see that route's module doc for the shared rationale (auth
 * gate, why `matchedCanonicalPoiId` needs the two-phase
 * place-consumer.ts composition, and what this route does and does not
 * claim to resolve on #363).
 *
 * `lat`/`lng` must already be GCJ02 (the providers' own documented default
 * coordinate system for this endpoint) -- this route never converts a
 * caller-supplied WGS84 point itself, matching
 * provider-nearby-adapter.ts's own module doc; a caller with a WGS84 point
 * must run it through lib/server/maps/coordinate-conversion.ts first.
 */

export const dynamic = "force-dynamic";

const isProvider = (value: string | null): value is Provider =>
  value === "amap" || value === "tencent";

const NEARBY_CATEGORIES: readonly NearbyCategory[] = ["restroom", "convenience_store", "dining", "pharmacy", "atm"];
const isNearbyCategory = (value: string | null): value is NearbyCategory =>
  NEARBY_CATEGORIES.includes(value as NearbyCategory);

function parseCoordinate(value: string | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function outcomeToResponse(outcome: NearbyOutcome) {
  switch (outcome.status) {
    case "observed":
      return NextResponse.json({ candidates: outcome.candidates }, { headers: { "Cache-Control": "private, no-store" } });
    case "no_results":
      return NextResponse.json({ candidates: [] }, { headers: { "Cache-Control": "private, no-store" } });
    case "UNRUN": {
      const failure = failureResponse("PROVIDER_UNAVAILABLE");
      return NextResponse.json({ ...failure, reason: outcome.reason }, { status: failure.status });
    }
    case "timeout": {
      const failure = failureResponse("TIMEOUT_BEFORE_OUTPUT");
      return NextResponse.json(failure, { status: failure.status });
    }
    case "http_error":
    case "provider_rejected":
    case "invalid_response":
    case "transport_or_response_error":
    default: {
      const failure = failureResponse("PROVIDER_UNAVAILABLE");
      return NextResponse.json(failure, { status: failure.status });
    }
  }
}

export async function GET(request: NextRequest) {
  const actor = await requireAuthenticatedActor(request);
  if (!actor) {
    const failure = failureResponse("UNAUTHENTICATED");
    return NextResponse.json(failure, { status: failure.status });
  }

  const { searchParams } = request.nextUrl;
  const provider = searchParams.get("provider");
  const category = searchParams.get("category");
  const lat = parseCoordinate(searchParams.get("lat"));
  const lng = parseCoordinate(searchParams.get("lng"));
  const radiusRaw = searchParams.get("radiusMeters");
  const radiusMeters = radiusRaw === null ? undefined : Number(radiusRaw);
  if (
    !isProvider(provider) ||
    !isNearbyCategory(category) ||
    lat === null || lat < -90 || lat > 90 ||
    lng === null || lng < -180 || lng > 180 ||
    (radiusRaw !== null && !Number.isFinite(radiusMeters))
  ) {
    const failure = failureResponse("INVALID_INPUT");
    return NextResponse.json(failure, { status: failure.status });
  }

  const outcome = await nearbySearchWithCanonicalMapping({
    provider,
    category,
    location: { lat, lng },
    radiusMeters,
    env: process.env,
    serviceClient: createMapsServiceRoleClient(),
  });
  return outcomeToResponse(outcome);
}
