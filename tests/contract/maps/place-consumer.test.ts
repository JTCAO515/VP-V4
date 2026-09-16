import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  searchPlacesWithCanonicalMapping,
  nearbySearchWithCanonicalMapping,
} from "../../../lib/server/maps/place-consumer.ts";

const searchEnv = { AMAP_SEARCH_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" };
const nearbyEnv = { AMAP_NEARBY_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" };

function supabaseClientWithFetch(fetchImpl: typeof fetch) {
  return createClient("https://synthetic.invalid", "synthetic-service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchImpl },
  });
}

test("search: a null serviceClient still returns real candidates, all unmapped", async () => {
  const outcome = await searchPlacesWithCanonicalMapping({
    provider: "amap",
    query: "广州塔",
    city: "广州市",
    env: searchEnv,
    serviceClient: null,
    fetcher: async () => Response.json({ status: "1", infocode: "10000", pois: [{ id: "B0001", name: "广州塔" }] }),
  });
  assert.equal(outcome.status, "observed");
  assert.equal(outcome.status === "observed" && outcome.candidates.length, 1);
  assert.equal(outcome.status === "observed" && outcome.candidates[0].matchedCanonicalPoiId, null);
});

test("search: a real serviceClient resolves matchedCanonicalPoiId from provider_poi_mappings", async () => {
  let mappingCalls = 0;
  const serviceClient = supabaseClientWithFetch(async (input) => {
    mappingCalls++;
    const url = new URL(String(input));
    assert.equal(url.pathname, "/rest/v1/provider_poi_mappings");
    assert.equal(url.searchParams.get("provider_poi_id"), "in.(B0001,B0002)");
    return Response.json([{ provider_poi_id: "B0001", canonical_poi_id: "3a683bd8-a757-42df-ae89-27c2e28c8dc7" }]);
  });
  const outcome = await searchPlacesWithCanonicalMapping({
    provider: "amap",
    query: "广州塔",
    city: "广州市",
    env: searchEnv,
    serviceClient,
    fetcher: async () =>
      Response.json({
        status: "1",
        infocode: "10000",
        pois: [{ id: "B0001", name: "广州塔" }, { id: "B0002", name: "广州塔纪念品店" }],
      }),
  });
  assert.equal(mappingCalls, 1);
  assert.equal(outcome.status, "observed");
  if (outcome.status !== "observed") throw new Error("unreachable");
  assert.equal(outcome.candidates[0].matchedCanonicalPoiId, "3a683bd8-a757-42df-ae89-27c2e28c8dc7");
  assert.equal(outcome.candidates[1].matchedCanonicalPoiId, null);
});

test("search: the mapping lookup is never queried when the provider call itself did not observe results", async () => {
  const serviceClient = supabaseClientWithFetch(async () => {
    throw new Error("must not call provider_poi_mappings when there are no candidates");
  });
  const outcome = await searchPlacesWithCanonicalMapping({
    provider: "amap",
    query: "无此地点",
    city: "广州市",
    env: searchEnv,
    serviceClient,
    fetcher: async () => Response.json({ status: "1", infocode: "10000", pois: [] }),
  });
  assert.equal(outcome.status, "no_results");
});

test("search: a disabled/UNRUN provider outcome never reaches the mapping lookup either", async () => {
  const serviceClient = supabaseClientWithFetch(async () => {
    throw new Error("must not call");
  });
  const outcome = await searchPlacesWithCanonicalMapping({
    provider: "amap",
    query: "广州塔",
    city: "广州市",
    env: {},
    serviceClient,
    fetcher: async () => {
      throw new Error("must not call provider either");
    },
  });
  assert.deepEqual(outcome, { status: "UNRUN", reason: "disabled" });
});

test("nearby: a null serviceClient still returns real candidates, all unmapped", async () => {
  const outcome = await nearbySearchWithCanonicalMapping({
    provider: "amap",
    category: "restroom",
    location: { lat: 23.1, lng: 113.3 },
    env: nearbyEnv,
    serviceClient: null,
    fetcher: async () => Response.json({ status: "1", infocode: "10000", pois: [{ id: "R0001", name: "公共厕所", distance: "50" }] }),
  });
  assert.equal(outcome.status, "observed");
  if (outcome.status !== "observed") throw new Error("unreachable");
  assert.equal(outcome.candidates[0].matchedCanonicalPoiId, null);
  assert.equal(outcome.candidates[0].distanceMeters, 50);
});

test("nearby: a real serviceClient resolves matchedCanonicalPoiId, preserving distanceMeters", async () => {
  const serviceClient = supabaseClientWithFetch(async () =>
    Response.json([{ provider_poi_id: "R0001", canonical_poi_id: "c6864370-ddec-4eef-9a7c-927151351102" }]),
  );
  const outcome = await nearbySearchWithCanonicalMapping({
    provider: "amap",
    category: "restroom",
    location: { lat: 23.1, lng: 113.3 },
    env: nearbyEnv,
    serviceClient,
    fetcher: async () => Response.json({ status: "1", infocode: "10000", pois: [{ id: "R0001", name: "公共厕所", distance: "50" }] }),
  });
  assert.equal(outcome.status, "observed");
  if (outcome.status !== "observed") throw new Error("unreachable");
  assert.equal(outcome.candidates[0].matchedCanonicalPoiId, "c6864370-ddec-4eef-9a7c-927151351102");
  assert.equal(outcome.candidates[0].distanceMeters, 50);
});
