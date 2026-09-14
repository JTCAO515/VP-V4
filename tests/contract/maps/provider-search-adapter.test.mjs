import test from "node:test";
import assert from "node:assert/strict";
import { searchPlaces, tencentSig, limits } from "../../../lib/server/maps/provider-search-adapter.ts";

const noMapping = () => null;

test("tencentSig matches the documented worked example (independent of scripts/maps/probe.mjs)", () => {
  const params = { key: "5Q5BZ-5EVWJ-SN5F3-K6QBZ-B3FAO-RVBWM", location: "28.7033487,115.8660847" };
  assert.equal(tencentSig("/ws/geocoder/v1", params, "SWvT26ypwq5Nwb5RvS8cLi6NSoH8HlJX"), "90da272bfa19122547298e2b0bcc0e50");
});

test("disabled or missing credentials never dispatch a request", async () => {
  for (const env of [{}, { AMAP_SEARCH_ENABLED: "true" }]) {
    const outcome = await searchPlaces({
      provider: "amap", query: "广州塔", city: "广州市", env, lookupMapping: noMapping,
      fetcher: () => { throw new Error("must not call"); },
    });
    assert.equal(outcome.status, "UNRUN");
  }
});

test("observed search normalizes rows into candidates and applies the mapping lookup", async () => {
  const outcome = await searchPlaces({
    provider: "amap", query: "广州塔", city: "广州市",
    env: { AMAP_SEARCH_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    lookupMapping: (provider, id) => (provider === "amap" && id === "B0001" ? "canonical-1" : null),
    fetcher: async (url, options) => {
      assert.equal(options.redirect, "error");
      assert.equal(url.hostname, "restapi.amap.com");
      return Response.json({ status: "1", infocode: "10000", pois: [{ id: "B0001", name: "广州塔" }, { id: "B0002", name: "广州塔纪念品店" }] });
    },
  });
  assert.equal(outcome.status, "observed");
  assert.equal(outcome.candidates.length, 2);
  assert.equal(outcome.candidates[0].matchedCanonicalPoiId, "canonical-1");
  assert.equal(outcome.candidates[1].matchedCanonicalPoiId, null);
});

test("zero rows is no_results, not an error", async () => {
  const outcome = await searchPlaces({
    provider: "tencent", query: "无此地点", city: "上海市",
    env: { TENCENT_MAP_SEARCH_ENABLED: "true", TENCENT_MAP_WEB_SERVICE_KEY: "secret" },
    lookupMapping: noMapping,
    fetcher: async () => Response.json({ status: 0, data: [] }),
  });
  assert.equal(outcome.status, "no_results");
});

test("provider rejection carries the code but never the message", async () => {
  const outcome = await searchPlaces({
    provider: "amap", query: "x", city: "y",
    env: { AMAP_SEARCH_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    lookupMapping: noMapping,
    fetcher: async () => Response.json({ status: "0", infocode: "10001", info: "secret-should-not-leak" }),
  });
  assert.deepEqual(outcome, { status: "provider_rejected", code: "10001" });
});

test("oversized response and transport failure are classified without retry", async () => {
  const oversized = await searchPlaces({
    provider: "amap", query: "x", city: "y",
    env: { AMAP_SEARCH_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" }, lookupMapping: noMapping,
    fetcher: async () => new Response("x".repeat(limits.responseBytes + 1)),
  });
  assert.equal(oversized.status, "transport_or_response_error");

  const transport = await searchPlaces({
    provider: "amap", query: "x", city: "y",
    env: { AMAP_SEARCH_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" }, lookupMapping: noMapping,
    fetcher: async () => { throw new Error("secret URL leaked"); },
  });
  assert.equal(transport.status, "transport_or_response_error");
});

test("tencent request is signed only when an SK is configured", async () => {
  let seenUrl;
  await searchPlaces({
    provider: "tencent", query: "x", city: "y",
    env: { TENCENT_MAP_SEARCH_ENABLED: "true", TENCENT_MAP_WEB_SERVICE_KEY: "secret", TENCENT_MAP_SK: "sk-value" },
    lookupMapping: noMapping,
    fetcher: async (url) => { seenUrl = url; return Response.json({ status: 0, data: [] }); },
  });
  assert.equal(seenUrl.searchParams.has("sig"), true);

  seenUrl = undefined;
  await searchPlaces({
    provider: "tencent", query: "x", city: "y",
    env: { TENCENT_MAP_SEARCH_ENABLED: "true", TENCENT_MAP_WEB_SERVICE_KEY: "secret" },
    lookupMapping: noMapping,
    fetcher: async (url) => { seenUrl = url; return Response.json({ status: 0, data: [] }); },
  });
  assert.equal(seenUrl.searchParams.has("sig"), false);
});
