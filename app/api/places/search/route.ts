import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthenticatedActor } from "@/lib/server/maps/web-auth";
import { enforcePlaceQuota } from "@/lib/server/maps/place-quota";
import { createMapsServiceRoleClient } from "@/lib/server/maps/service-role-client";
import { searchPlacesWithCanonicalMapping } from "@/lib/server/maps/place-consumer";
import type { Provider } from "@/lib/server/maps/place-identity";
import { failureResponse } from "@/lib/server/identity/failure-response";
import type { SearchOutcome } from "@/lib/server/maps/provider-search-adapter";

/**
 * First real `app/api/places/**` route consumer of #363's search adapter
 * and its canonical-mapping lookup (see
 * lib/server/maps/place-consumer.ts's doc). Partial advance on #363's
 * still-open "地图、列表、详情共享选中ID" acceptance bullet -- this makes a
 * search result's `matchedCanonicalPoiId` genuinely reachable over HTTP for
 * the first time, not a claim that the bullet, or #363 itself, is done.
 * Map/list/detail UI actually sharing that id across surfaces, the
 * remaining `app/api/places/nearby` wiring's sibling concerns, single
 * primary map-display SDK, credential domain separation and
 * observation-vs-Fact permission isolation all remain separate, unclaimed
 * work.
 *
 * Requires a real Supabase session (see web-auth.ts's doc for why) --
 * anonymous callers get `UNAUTHENTICATED`, never a provider call. Both
 * provider env flags (`AMAP_SEARCH_ENABLED`/`TENCENT_MAP_SEARCH_ENABLED`)
 * default unset everywhere today, so this route safely returns
 * `PROVIDER_UNAVAILABLE` with `reason: "disabled"` until an operator
 * explicitly turns one on -- it never silently spends provider quota.
 */

export const dynamic = "force-dynamic";

const isProvider = (value: string | null): value is Provider =>
  value === "amap" || value === "tencent";

function boundedText(value: string | null, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function outcomeToResponse(outcome: SearchOutcome) {
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
  const query = searchParams.get("q");
  const city = searchParams.get("city");
  if (!isProvider(provider) || !boundedText(query, 200) || !boundedText(city, 100)) {
    const failure = failureResponse("INVALID_INPUT");
    return NextResponse.json(failure, { status: failure.status });
  }

  // Per-actor provider quota, checked only once input is valid; fail-closed.
  const quotaRejection = await enforcePlaceQuota(actor.client, "places", request.signal);
  if (quotaRejection) return quotaRejection;

  const outcome = await searchPlacesWithCanonicalMapping({
    provider,
    query,
    city,
    env: process.env,
    serviceClient: createMapsServiceRoleClient(),
  });
  return outcomeToResponse(outcome);
}
