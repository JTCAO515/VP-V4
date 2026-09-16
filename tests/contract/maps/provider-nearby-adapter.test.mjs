import test from "node:test";
import assert from "node:assert/strict";
import { nearbySearch, limits } from "../../../lib/server/maps/provider-nearby-adapter.ts";

const noMapping = () => null;
const location = { lat: 23.106, lng: 113.324 };

test("disabled or missing credentials never dispatch a request", async () => {
  for (const env of [{}, { AMAP_NEARBY_ENABLED: "true" }]) {
    const outcome = await nearbySearch({
      provider: "amap", category: "restroom", location, env, lookupMapping: noMapping,
      fetcher: () => { throw new Error("must not call"); },
    });
    assert.equal(outcome.status, "UNRUN");
  }
});

test("observed amap nearby search sends the category keyword, location and radius, and parses distance", async () => {
  const outcome = await nearbySearch({
    provider: "amap", category: "convenience_store", location, radiusMeters: 800,
    env: { AMAP_NEARBY_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    lookupMapping: (provider, id) => (provider === "amap" && id === "B0001" ? "canonical-1" : null),
    fetcher: async (url, options) => {
      assert.equal(options.redirect, "error");
      assert.equal(url.hostname, "restapi.amap.com");
      assert.equal(url.searchParams.get("keywords"), "便利店");
      assert.equal(url.searchParams.get("location"), "113.324,23.106");
      assert.equal(url.searchParams.get("radius"), "800");
      return Response.json({
        status: "1", infocode: "10000",
        pois: [{ id: "B0001", name: "全家便利店", distance: "42" }, { id: "B0002", name: "711便利店" }],
      });
    },
  });
  assert.equal(outcome.status, "observed");
  assert.equal(outcome.candidates.length, 2);
  assert.equal(outcome.candidates[0].matchedCanonicalPoiId, "canonical-1");
  assert.equal(outcome.candidates[0].distanceMeters, 42);
  assert.equal(outcome.candidates[1].matchedCanonicalPoiId, null);
  assert.equal(outcome.candidates[1].distanceMeters, null);
});

test("observed tencent nearby search sends a nearby(...) boundary, signs the request and parses _distance", async () => {
  let seenUrl;
  const outcome = await nearbySearch({
    provider: "tencent", category: "atm", location,
    env: { TENCENT_MAP_NEARBY_ENABLED: "true", TENCENT_MAP_WEB_SERVICE_KEY: "secret", TENCENT_MAP_SK: "sk-value" },
    lookupMapping: noMapping,
    fetcher: async (url) => {
      seenUrl = url;
      assert.equal(url.searchParams.get("keyword"), "ATM");
      assert.equal(url.searchParams.get("boundary"), `nearby(${location.lat},${location.lng},1000)`);
      return Response.json({ status: 0, data: [{ id: "t1", title: "工商银行ATM", _distance: 15.5 }] });
    },
  });
  assert.equal(seenUrl.searchParams.has("sig"), true);
  assert.equal(outcome.status, "observed");
  assert.equal(outcome.candidates[0].rawName, "工商银行ATM");
  assert.equal(outcome.candidates[0].distanceMeters, 15.5);
});

test("radius is clamped into the declared bound and defaulted when omitted or invalid", async () => {
  let seenUrl;
  await nearbySearch({
    provider: "amap", category: "restroom", location, radiusMeters: 999999,
    env: { AMAP_NEARBY_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" }, lookupMapping: noMapping,
    fetcher: async (url) => { seenUrl = url; return Response.json({ status: "1", infocode: "10000", pois: [] }); },
  });
  assert.equal(seenUrl.searchParams.get("radius"), String(limits.radiusMetersMax));

  await nearbySearch({
    provider: "amap", category: "restroom", location, radiusMeters: -5,
    env: { AMAP_NEARBY_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" }, lookupMapping: noMapping,
    fetcher: async (url) => { seenUrl = url; return Response.json({ status: "1", infocode: "10000", pois: [] }); },
  });
  assert.equal(seenUrl.searchParams.get("radius"), String(limits.radiusMetersDefault));
});

test("zero rows is no_results, not an error", async () => {
  const outcome = await nearbySearch({
    provider: "tencent", category: "pharmacy", location,
    env: { TENCENT_MAP_NEARBY_ENABLED: "true", TENCENT_MAP_WEB_SERVICE_KEY: "secret" },
    lookupMapping: noMapping,
    fetcher: async () => Response.json({ status: 0, data: [] }),
  });
  assert.equal(outcome.status, "no_results");
});

test("provider rejection carries the code but never the message", async () => {
  const outcome = await nearbySearch({
    provider: "amap", category: "dining", location,
    env: { AMAP_NEARBY_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    lookupMapping: noMapping,
    fetcher: async () => Response.json({ status: "0", infocode: "10001", info: "secret-should-not-leak" }),
  });
  assert.deepEqual(outcome, { status: "provider_rejected", code: "10001" });
});

test("oversized response and transport failure are classified without retry", async () => {
  const oversized = await nearbySearch({
    provider: "amap", category: "dining", location,
    env: { AMAP_NEARBY_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" }, lookupMapping: noMapping,
    fetcher: async () => new Response("x".repeat(limits.responseBytes + 1)),
  });
  assert.equal(oversized.status, "transport_or_response_error");

  const transport = await nearbySearch({
    provider: "amap", category: "dining", location,
    env: { AMAP_NEARBY_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" }, lookupMapping: noMapping,
    fetcher: async () => { throw new Error("secret URL leaked"); },
  });
  assert.equal(transport.status, "transport_or_response_error");
});

test("http error status is classified with the observed status code", async () => {
  const outcome = await nearbySearch({
    provider: "amap", category: "dining", location,
    env: { AMAP_NEARBY_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" }, lookupMapping: noMapping,
    fetcher: async () => new Response("", { status: 503 }),
  });
  assert.deepEqual(outcome, { status: "http_error", httpStatus: 503 });
});

test("rows missing an id or name are dropped; an all-bad response is invalid_response, not observed", async () => {
  const outcome = await nearbySearch({
    provider: "amap", category: "dining", location,
    env: { AMAP_NEARBY_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" }, lookupMapping: noMapping,
    fetcher: async () => Response.json({ status: "1", infocode: "10000", pois: [{ name: "缺id的店" }] }),
  });
  assert.equal(outcome.status, "invalid_response");
});

test("tencent request is signed only when an SK is configured", async () => {
  let seenUrl;
  await nearbySearch({
    provider: "tencent", category: "restroom", location,
    env: { TENCENT_MAP_NEARBY_ENABLED: "true", TENCENT_MAP_WEB_SERVICE_KEY: "secret" },
    lookupMapping: noMapping,
    fetcher: async (url) => { seenUrl = url; return Response.json({ status: 0, data: [] }); },
  });
  assert.equal(seenUrl.searchParams.has("sig"), false);
});
