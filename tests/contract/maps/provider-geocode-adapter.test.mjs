import test from "node:test";
import assert from "node:assert/strict";
import { geocodeAddress } from "../../../lib/server/maps/provider-geocode-adapter.ts";
import { limits } from "../../../lib/server/maps/provider-search-adapter.ts";

test("disabled or missing credentials never dispatch a request", async () => {
  for (const env of [{}, { AMAP_GEOCODE_ENABLED: "true" }]) {
    const outcome = await geocodeAddress({
      provider: "amap", address: "广州市海珠区阅江西路222号", env,
      fetcher: () => { throw new Error("must not call"); },
    });
    assert.equal(outcome.status, "UNRUN");
  }
});

test("observed amap geocode parses the lng,lat location string and forwards the city hint", async () => {
  const outcome = await geocodeAddress({
    provider: "amap", address: "阅江西路222号", city: "广州",
    env: { AMAP_GEOCODE_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    fetcher: async (url, options) => {
      assert.equal(options.redirect, "error");
      assert.equal(url.hostname, "restapi.amap.com");
      assert.equal(url.searchParams.get("address"), "阅江西路222号");
      assert.equal(url.searchParams.get("city"), "广州");
      return Response.json({
        status: "1", info: "OK", infocode: "10000", count: "1",
        geocodes: [{ formatted_address: "广东省广州市海珠区阅江西路222号", location: "113.324,23.106" }],
      });
    },
  });
  assert.equal(outcome.status, "observed");
  assert.equal(outcome.result.formattedAddress, "广东省广州市海珠区阅江西路222号");
  assert.deepEqual(outcome.result.location, { lat: 23.106, lng: 113.324, coordinateSystem: "gcj02" });
});

test("observed tencent geocode parses the {lat,lng} location object and signs the request", async () => {
  let seenUrl;
  const outcome = await geocodeAddress({
    provider: "tencent", address: "上海市浦东新区世纪大道1号",
    env: { TENCENT_MAP_GEOCODE_ENABLED: "true", TENCENT_MAP_WEB_SERVICE_KEY: "secret", TENCENT_MAP_SK: "sk-value" },
    fetcher: async (url) => {
      seenUrl = url;
      return Response.json({ status: 0, message: "query ok", result: { location: { lat: 31.2397, lng: 121.4998 }, address: "上海市浦东新区世纪大道1号" } });
    },
  });
  assert.equal(seenUrl.searchParams.has("sig"), true);
  assert.equal(outcome.status, "observed");
  assert.equal(outcome.result.formattedAddress, "上海市浦东新区世纪大道1号");
  assert.deepEqual(outcome.result.location, { lat: 31.2397, lng: 121.4998, coordinateSystem: "gcj02" });
});

test("missing/malformed location is null, never a fabricated 0,0", async () => {
  const outcome = await geocodeAddress({
    provider: "amap", address: "某无坐标地址",
    env: { AMAP_GEOCODE_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    fetcher: async () => Response.json({ status: "1", info: "OK", infocode: "10000", count: "1", geocodes: [{ formatted_address: "某省某市某无坐标地址" }] }),
  });
  assert.equal(outcome.status, "observed");
  assert.equal(outcome.result.location, null);
});

test("an out-of-range provider location is rejected as null, not silently accepted (#363 runtime coordinate guard)", async () => {
  const amapOutOfRange = await geocodeAddress({
    provider: "amap", address: "阅江西路222号",
    env: { AMAP_GEOCODE_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    fetcher: async () => Response.json({
      status: "1", info: "OK", infocode: "10000", count: "1",
      // lat 990 is not a valid latitude -- a corrupted/garbage provider value.
      geocodes: [{ formatted_address: "广东省广州市海珠区阅江西路222号", location: "113.324,990" }],
    }),
  });
  assert.equal(amapOutOfRange.status, "observed");
  assert.equal(amapOutOfRange.result.location, null);

  const tencentOutOfRange = await geocodeAddress({
    provider: "tencent", address: "上海市浦东新区世纪大道1号",
    env: { TENCENT_MAP_GEOCODE_ENABLED: "true", TENCENT_MAP_WEB_SERVICE_KEY: "secret", TENCENT_MAP_SK: "sk-value" },
    // lng 999 is not a valid longitude -- a corrupted/garbage provider value.
    fetcher: async () => Response.json({ status: 0, message: "query ok", result: { location: { lat: 31.2397, lng: 999 }, address: "上海市浦东新区世纪大道1号" } }),
  });
  assert.equal(tencentOutOfRange.status, "observed");
  assert.equal(tencentOutOfRange.result.location, null);
});

test("empty result set is not_found, not an error", async () => {
  const amapEmpty = await geocodeAddress({
    provider: "amap", address: "不存在的地址",
    env: { AMAP_GEOCODE_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    fetcher: async () => Response.json({ status: "1", info: "OK", infocode: "10000", count: "0", geocodes: [] }),
  });
  assert.equal(amapEmpty.status, "not_found");

  const tencentEmpty = await geocodeAddress({
    provider: "tencent", address: "不存在的地址",
    env: { TENCENT_MAP_GEOCODE_ENABLED: "true", TENCENT_MAP_WEB_SERVICE_KEY: "secret" },
    fetcher: async () => Response.json({ status: 0, message: "query ok", result: null }),
  });
  assert.equal(tencentEmpty.status, "not_found");
});

test("provider rejection carries the code but never the message", async () => {
  const outcome = await geocodeAddress({
    provider: "amap", address: "x",
    env: { AMAP_GEOCODE_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    fetcher: async () => Response.json({ status: "0", infocode: "20003", info: "secret-should-not-leak" }),
  });
  assert.deepEqual(outcome, { status: "provider_rejected", code: "20003" });
});

test("oversized response and transport failure are classified without retry", async () => {
  const oversized = await geocodeAddress({
    provider: "amap", address: "x",
    env: { AMAP_GEOCODE_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    fetcher: async () => new Response("x".repeat(limits.responseBytes + 1)),
  });
  assert.equal(oversized.status, "transport_or_response_error");

  const transport = await geocodeAddress({
    provider: "amap", address: "x",
    env: { AMAP_GEOCODE_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    fetcher: async () => { throw new Error("secret URL leaked"); },
  });
  assert.equal(transport.status, "transport_or_response_error");
});

test("http error status is classified with the observed status code", async () => {
  const outcome = await geocodeAddress({
    provider: "amap", address: "x",
    env: { AMAP_GEOCODE_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    fetcher: async () => new Response("", { status: 503 }),
  });
  assert.deepEqual(outcome, { status: "http_error", httpStatus: 503 });
});
