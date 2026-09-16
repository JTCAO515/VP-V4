import type { SupabaseClient } from "@supabase/supabase-js";
import type { Provider } from "./place-identity.ts";

/**
 * Real, DB-backed implementation of the `(provider, providerPoiId) => string
 * | null` `lookupMapping` contract that `provider-search-adapter.ts` and
 * `provider-nearby-adapter.ts` already require as a caller-supplied
 * parameter — see those modules' docs: "lookupMapping only answers 'does
 * this provider id already have a mapping', supplied by the caller so this
 * module stays DB-free and unit-testable". Until this module, no real
 * implementation existed anywhere in the repo; every existing call site
 * (tests/contract/maps/provider-search-adapter.test.mjs,
 * provider-nearby-adapter.test.mjs) supplies a hand-written in-memory mock.
 * This queries `public.provider_poi_mappings` (service-role only — RLS
 * enabled, no `anon`/`authenticated` grant, see
 * supabase/migrations/20260914100000_vpj_19_363_place_identity.sql) and
 * never merges by name/vector similarity, matching place-identity.ts's
 * invariant: a match exists only when an explicit mapping row already does.
 *
 * Batched, not per-candidate. The adapters call `lookupMapping` once per
 * response row, synchronously, while normalizing an already-fetched
 * provider response — a live per-row DB round trip would be both the wrong
 * shape (the adapters' `lookupMapping` parameter is synchronous, not a
 * Promise) and needlessly slow (N round trips per response). Call
 * `loadCanonicalMappingLookup` once, after the provider has replied, with
 * every `providerPoiId` present in that response (the adapters' candidate
 * rows carry it), then pass its returned synchronous function straight into
 * `searchPlaces`/`nearbySearch` as `lookupMapping`.
 *
 * A DB error (network failure, RLS/service-role misconfiguration, malformed
 * row) collapses to "no known mapping" for every id in that batch, the same
 * "never guessed, unknown when unavailable" posture the rest of this slice
 * already uses for entrance data and coordinate systems — it never widens
 * into a search failure, since the underlying provider search/nearby result
 * is still valid without a canonical match. `dbError` on the return value
 * lets a caller that cares (logging, retry policy) distinguish "checked, no
 * match" from "could not check" without changing the synchronous lookup
 * function's own `string | null` contract.
 */
export async function loadCanonicalMappingLookup(
  client: SupabaseClient,
  provider: Provider,
  providerPoiIds: readonly string[],
): Promise<{
  lookupMapping: (lookupProvider: Provider, providerPoiId: string) => string | null;
  dbError: boolean;
}> {
  const ids = [...new Set(providerPoiIds)].filter(
    (id): id is string => typeof id === "string" && id.length >= 1 && id.length <= 128,
  );
  const map = new Map<string, string>();
  if (ids.length === 0) {
    return { lookupMapping: () => null, dbError: false };
  }
  let dbError = false;
  try {
    const { data, error } = await client
      .from("provider_poi_mappings")
      .select("provider_poi_id, canonical_poi_id")
      .eq("provider", provider)
      .in("provider_poi_id", ids);
    if (error || !Array.isArray(data)) {
      dbError = true;
    } else {
      for (const row of data) {
        if (!row || typeof row !== "object") continue;
        const r = row as Record<string, unknown>;
        if (typeof r.provider_poi_id === "string" && typeof r.canonical_poi_id === "string") {
          map.set(r.provider_poi_id, r.canonical_poi_id);
        }
      }
    }
  } catch {
    dbError = true;
  }
  return {
    lookupMapping: (lookupProvider, providerPoiId) =>
      lookupProvider === provider ? map.get(providerPoiId) ?? null : null,
    dbError,
  };
}
