import test from "node:test";
import assert from "node:assert/strict";
import { suggestPlaces } from "../../../lib/server/maps/provider-suggest-adapter.ts";
import { limits } from "../../../lib/server/maps/provider-search-adapter.ts";

test("disabled or missing credentials never dispatch a request", async () => {
  for (const env of [{}, { AMAP_SUGGEST_ENABLED: "true" }]) {
    const outcome = await suggestPlaces({
      provider: "amap", query: "阅江西路", env,
      fetcher: () => { throw new Error("must not call"); },
    });
    assert.equal(outcome.status, "UNRUN");
  }
});

test("observed amap tips parse the lng,lat location string and forward the city hint", async () => {
  const outcome = await suggestPlaces({
    provider: "amap", query: "阅江西路", city: "广州",
    env: { AMAP_SUGGEST_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    fetcher: async (url, options) => {
      assert.equal(options.redirect, "error");
      assert.equal(url.hostname, "restapi.amap.com");
      assert.equal(url.searchParams.get("keywords"), "阅江西路");
      assert.equal(url.searchParams.get("city"), "广州");
      assert.equal(url.searchParams.get("citylimit"), "true");
      return Response.json({
        status: "1", info: "OK", infocode: "10000", count: "1",
        tips: [{ id: "B0FFG9L9V6", name: "阅江西路222号", district: "广州市海珠区", location: "113.324,23.106" }],
      });
    },
  });
  assert.equal(outcome.status, "observed");
  assert.equal(outcome.candidates.length, 1);
  assert.equal(outcome.candidates[0].providerPoiId, "B0FFG9L9V6");
  assert.equal(outcome.candidates[0].rawName, "阅江西路222号");
  assert.deepEqual(outcome.candidates[0].location, { lat: 23.106, lng: 113.324, coordinateSystem: "gcj02" });
});

test("observed tencent suggestions parse the {lat,lng} location object and sign the request", async () => {
  let seenUrl;
  const outcome = await suggestPlaces({
    provider: "tencent", query: "世纪大道",
    env: { TENCENT_MAP_SUGGEST_ENABLED: "true", TENCENT_MAP_WEB_SERVICE_KEY: "secret", TENCENT_MAP_SK: "sk-value" },
    fetcher: async (url) => {
      seenUrl = url;
      return Response.json({
        status: 0, message: "query ok", count: 1,
        data: [{ id: "tencent-poi-1", title: "世纪大道1号", address: "上海市浦东新区世纪大道1号", location: { lat: 31.2397, lng: 121.4998 } }],
      });
    },
  });
  assert.equal(seenUrl.searchParams.has("sig"), true);
  assert.equal(outcome.status, "observed");
  assert.equal(outcome.candidates[0].providerPoiId, "tencent-poi-1");
  assert.equal(outcome.candidates[0].rawName, "世纪大道1号");
  assert.deepEqual(outcome.candidates[0].location, { lat: 31.2397, lng: 121.4998, coordinateSystem: "gcj02" });
});

test("a tip with no backing POI keeps a null providerPoiId and null location, never fabricated", async () => {
  const outcome = await suggestPlaces({
    provider: "amap", query: "咖啡",
    env: { AMAP_SUGGEST_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    fetcher: async () => Response.json({
      status: "1", info: "OK", infocode: "10000", count: "1",
      tips: [{ id: "", name: "咖啡", district: "", location: "" }],
    }),
  });
  assert.equal(outcome.status, "observed");
  assert.equal(outcome.candidates[0].providerPoiId, null);
  assert.equal(outcome.candidates[0].location, null);
});

test("empty result set is no_results, not an error", async () => {
  const amapEmpty = await suggestPlaces({
    provider: "amap", query: "不存在的关键字",
    env: { AMAP_SUGGEST_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    fetcher: async () => Response.json({ status: "1", info: "OK", infocode: "10000", count: "0", tips: [] }),
  });
  assert.equal(amapEmpty.status, "no_results");

  const tencentEmpty = await suggestPlaces({
    provider: "tencent", query: "不存在的关键字",
    env: { TENCENT_MAP_SUGGEST_ENABLED: "true", TENCENT_MAP_WEB_SERVICE_KEY: "secret" },
    fetcher: async () => Response.json({ status: 0, message: "query ok", count: 0, data: [] }),
  });
  assert.equal(tencentEmpty.status, "no_results");
});

test("provider rejection carries the code but never the message", async () => {
  const outcome = await suggestPlaces({
    provider: "amap", query: "x",
    env: { AMAP_SUGGEST_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    fetcher: async () => Response.json({ status: "0", infocode: "20003", info: "secret-should-not-leak" }),
  });
  assert.deepEqual(outcome, { status: "provider_rejected", code: "20003" });
});

test("oversized response and transport failure are classified without retry", async () => {
  const oversized = await suggestPlaces({
    provider: "amap", query: "x",
    env: { AMAP_SUGGEST_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    fetcher: async () => new Response("x".repeat(limits.responseBytes + 1)),
  });
  assert.equal(oversized.status, "transport_or_response_error");

  const transport = await suggestPlaces({
    provider: "amap", query: "x",
    env: { AMAP_SUGGEST_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    fetcher: async () => { throw new Error("secret URL leaked"); },
  });
  assert.equal(transport.status, "transport_or_response_error");
});

test("http error status is classified with the observed status code", async () => {
  const outcome = await suggestPlaces({
    provider: "amap", query: "x",
    env: { AMAP_SUGGEST_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    fetcher: async () => new Response("", { status: 503 }),
  });
  assert.deepEqual(outcome, { status: "http_error", httpStatus: 503 });
});

test("rows missing a name are dropped; an all-bad response is invalid_response, not observed", async () => {
  const outcome = await suggestPlaces({
    provider: "amap", query: "x",
    env: { AMAP_SUGGEST_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    fetcher: async () => Response.json({ status: "1", info: "OK", infocode: "10000", count: "1", tips: [{ id: "x" }] }),
  });
  assert.equal(outcome.status, "invalid_response");
});
