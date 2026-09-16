import type { SupabaseClient } from "@supabase/supabase-js";
import type { Provider } from "./place-identity.ts";
import { searchPlaces, type SearchOutcome } from "./provider-search-adapter.ts";
import { nearbySearch, type NearbyOutcome, type NearbyCategory } from "./provider-nearby-adapter.ts";
import { loadCanonicalMappingLookup } from "./canonical-mapping-repository.ts";

/**
 * Route-facing composition for #363's still-open "地图、列表、详情共享选中ID"
 * acceptance bullet. searchPlaces()/nearbySearch() both require their
 * lookupMapping(provider, providerPoiId) parameter to already be a
 * synchronous closure *before* the candidates it will be applied to are
 * known -- it's invoked row-by-row while each adapter normalizes the
 * provider's own response (see either adapter's module doc). A real,
 * DB-backed canonical match can't be threaded straight through as that
 * parameter for that reason: `loadCanonicalMappingLookup` itself needs the
 * response's real providerPoiIds first, which don't exist until the
 * provider has already replied.
 *
 * These two functions do the two-phase call
 * canonical-mapping-repository.ts's own doc anticipates: run the provider
 * search/nearby call first with an always-null lookup (learning the
 * response's real providerPoiIds costs nothing extra -- normalizeCandidates
 * always ran that closure anyway), then do one batched
 * provider_poi_mappings query for exactly those ids, then remap
 * `matchedCanonicalPoiId` over the already-fetched candidates. Exactly one
 * provider network call happens either way; a database round trip is added
 * only when `serviceClient` is non-null, and only after a real provider
 * response with candidates exists (`raw.status !== "observed"` skips it
 * entirely -- no result to remap and nothing to query for).
 *
 * `serviceClient` is caller-supplied, never constructed here (mirrors
 * canonical-mapping-repository.ts's own "caller supplies the client"
 * contract) -- ordinarily `createMapsServiceRoleClient()`'s return value,
 * which is `null` in any environment that hasn't provisioned the
 * service-role secret that factory reads (see its own doc). A `null`
 * client degrades to "search/nearby still returns real results,
 * matchedCanonicalPoiId just stays null for all of them" -- identical to
 * this repo's behavior everywhere before this module existed, never a
 * harder failure.
 */

export async function searchPlacesWithCanonicalMapping(input: {
  provider: Provider;
  query: string;
  city: string;
  env: Readonly<Record<string, string | undefined>>;
  serviceClient: SupabaseClient | null;
  fetcher?: typeof fetch;
}): Promise<SearchOutcome> {
  const { provider, query, city, env, serviceClient, fetcher } = input;
  const raw = await searchPlaces({ provider, query, city, env, lookupMapping: () => null, fetcher });
  if (raw.status !== "observed" || !serviceClient) return raw;
  const { lookupMapping } = await loadCanonicalMappingLookup(
    serviceClient,
    provider,
    raw.candidates.map((c) => c.providerPoiId),
  );
  return {
    status: "observed",
    candidates: Object.freeze(
      raw.candidates.map((c) =>
        Object.freeze({ ...c, matchedCanonicalPoiId: lookupMapping(provider, c.providerPoiId) }),
      ),
    ),
  };
}

export async function nearbySearchWithCanonicalMapping(input: {
  provider: Provider;
  category: NearbyCategory;
  /** Must already be in the providers' documented default coordinate system (GCJ02) -- see provider-nearby-adapter.ts's module doc. */
  location: Readonly<{ lat: number; lng: number }>;
  radiusMeters?: number;
  env: Readonly<Record<string, string | undefined>>;
  serviceClient: SupabaseClient | null;
  fetcher?: typeof fetch;
}): Promise<NearbyOutcome> {
  const { provider, category, location, radiusMeters, env, serviceClient, fetcher } = input;
  const raw = await nearbySearch({ provider, category, location, radiusMeters, env, lookupMapping: () => null, fetcher });
  if (raw.status !== "observed" || !serviceClient) return raw;
  const { lookupMapping } = await loadCanonicalMappingLookup(
    serviceClient,
    provider,
    raw.candidates.map((c) => c.providerPoiId),
  );
  return {
    status: "observed",
    candidates: Object.freeze(
      raw.candidates.map((c) =>
        Object.freeze({ ...c, matchedCanonicalPoiId: lookupMapping(provider, c.providerPoiId) }),
      ),
    ),
  };
}
