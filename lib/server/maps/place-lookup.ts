import { compareRoutes } from "./route-comparison.ts";
import { loadCanonicalMappingLookup } from "./canonical-mapping-repository.ts";
import { getPlaceDetail } from "./provider-detail-adapter.ts";
import { geocodeAddress } from "./provider-geocode-adapter.ts";
import { suggestPlaces } from "./provider-suggest-adapter.ts";
import { reverseGeocode } from "./provider-reverse-geocode-adapter.ts";
import { nearbySearchWithCanonicalMapping, searchPlacesWithCanonicalMapping } from "./place-consumer.ts";
import type { NearbyCategory } from "./provider-nearby-adapter.ts";

type Dependencies = Pick<Parameters<typeof searchPlacesWithCanonicalMapping>[0], "env" | "serviceClient" | "fetcher">;
const categories: readonly string[] = ["restroom", "convenience_store", "dining", "pharmacy", "atm"];
const bounded = (value: string | null, max: number): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= max;
const failure = (code: string, status: number) => ({ status, body: { error: { code } } });

/** Auth is owned by the calling Web/native route. One explicit operation and provider,
 * no publication, persistence, implicit location request or provider fallback. */
export async function lookupPlace(params: URLSearchParams, dependencies: Dependencies) {
  const provider = params.get("provider"), action = params.get("action");
  if (provider !== "amap" && provider !== "tencent") return failure("INVALID_INPUT", 400);
  const input = { ...dependencies, provider } as const;
  if (action === "routes") return compareRoutes(params, dependencies);
  let outcome;
  if (action === "search" || action === "suggest" || action === "geocode") {
    const q = params.get("q"), city = params.get("city");
    if (!bounded(q, 200) || !bounded(city, 100)) return failure("INVALID_INPUT", 400);
    outcome = action === "search" ? await searchPlacesWithCanonicalMapping({ ...input, query: q, city })
      : action === "suggest" ? await suggestPlaces({ ...input, query: q, city })
      : await geocodeAddress({ ...input, address: q, city });
  } else if (action === "detail") {
    const id = params.get("id");
    if (!bounded(id, 128)) return failure("INVALID_INPUT", 400);
    outcome = await getPlaceDetail({ ...input, providerPoiId: id });
  } else if (action === "nearby" || action === "reverse") {
    const latitude = params.get("lat"), longitude = params.get("lng");
    if (!bounded(latitude, 24) || !bounded(longitude, 24) || params.get("system") !== "gcj02") return failure("INVALID_INPUT", 400);
    const lat = Number(latitude), lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return failure("INVALID_INPUT", 400);
    if (action === "nearby") {
      const category = params.get("category");
      if (!category || !categories.includes(category)) return failure("INVALID_INPUT", 400);
      outcome = await nearbySearchWithCanonicalMapping({ ...input, category: category as NearbyCategory, location: { lat, lng }, radiusMeters: 1000 });
    } else {
      if (provider !== "amap") return failure("PROVIDER_UNAVAILABLE", 503);
      outcome = await reverseGeocode({ ...input, location: { lat, lng, system: "gcj02" } });
    }
  } else return failure("INVALID_INPUT", 400);
  if (outcome.status === "observed") {
    if (action === "suggest" && "candidates" in outcome && dependencies.serviceClient) {
      const ids = outcome.candidates.flatMap(candidate => candidate.providerPoiId ? [candidate.providerPoiId] : []);
      const { lookupMapping } = await loadCanonicalMappingLookup(dependencies.serviceClient, provider, ids);
      return { status: 200, body: { ...outcome, candidates: outcome.candidates.map(candidate => ({ ...candidate, matchedCanonicalPoiId: candidate.providerPoiId ? lookupMapping(provider, candidate.providerPoiId) : null })), observedAt: new Date().toISOString(), evidenceKind: "provider_observation", entrance: "unknown", specialServices: "unknown" } };
    }
    return { status: 200, body: { ...outcome, observedAt: new Date().toISOString(), evidenceKind: "provider_observation", entrance: "unknown", specialServices: "unknown" } };
  }
  if (outcome.status === "no_results" || outcome.status === "not_found") return { status: 200, body: { status: outcome.status, candidates: [], detail: null, result: null } };
  return failure(outcome.status === "timeout" ? "TIMEOUT_BEFORE_OUTPUT" : "PROVIDER_UNAVAILABLE", 503);
}
