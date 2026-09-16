import test from "node:test";
import assert from "node:assert/strict";
import { getPlaceDetail } from "../../../lib/server/maps/provider-detail-adapter.ts";
import { limits } from "../../../lib/server/maps/provider-search-adapter.ts";

test("disabled or missing credentials never dispatch a request", async () => {
  for (const env of [{}, { AMAP_DETAIL_ENABLED: "true" }]) {
    const outcome = await getPlaceDetail({
      provider: "amap", providerPoiId: "B0001", env,
      fetcher: () => { throw new Error("must not call"); },
    });
    assert.equal(outcome.status, "UNRUN");
  }
});

test("observed amap detail parses the lng,lat location string", async () => {
  const outcome = await getPlaceDetail({
    provider: "amap", providerPoiId: "B0001",
    env: { AMAP_DETAIL_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    fetcher: async (url, options) => {
      assert.equal(options.redirect, "error");
      assert.equal(url.hostname, "restapi.amap.com");
      assert.equal(url.searchParams.get("id"), "B0001");
      return Response.json({
        status: "1", infocode: "10000",
        pois: [{ id: "B0001", name: "广州塔", address: "广州市海珠区阅江西路222号", location: "113.324,23.106" }],
      });
    },
  });
  assert.equal(outcome.status, "observed");
  assert.equal(outcome.detail.rawName, "广州塔");
  assert.equal(outcome.detail.address, "广州市海珠区阅江西路222号");
  assert.deepEqual(outcome.detail.location, { lat: 23.106, lng: 113.324, coordinateSystem: "gcj02" });
});

test("observed tencent detail parses the {lat,lng} location object and signs the request", async () => {
  let seenUrl;
  const outcome = await getPlaceDetail({
    provider: "tencent", providerPoiId: "abc123",
    env: { TENCENT_MAP_DETAIL_ENABLED: "true", TENCENT_MAP_WEB_SERVICE_KEY: "secret", TENCENT_MAP_SK: "sk-value" },
    fetcher: async (url) => {
      seenUrl = url;
      return Response.json({ status: 0, message: "query ok", result: { id: "abc123", title: "东方明珠", address: "上海市浦东新区世纪大道1号", location: { lat: 31.2397, lng: 121.4998 } } });
    },
  });
  assert.equal(seenUrl.searchParams.has("sig"), true);
  assert.equal(outcome.status, "observed");
  assert.equal(outcome.detail.rawName, "东方明珠");
  assert.deepEqual(outcome.detail.location, { lat: 31.2397, lng: 121.4998, coordinateSystem: "gcj02" });
});

test("missing/malformed location is null, never a fabricated 0,0", async () => {
  const outcome = await getPlaceDetail({
    provider: "amap", providerPoiId: "B0002",
    env: { AMAP_DETAIL_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    fetcher: async () => Response.json({ status: "1", infocode: "10000", pois: [{ id: "B0002", name: "未知坐标点" }] }),
  });
  assert.equal(outcome.status, "observed");
  assert.equal(outcome.detail.location, null);
  assert.equal(outcome.detail.address, null);
});

test("empty result set is not_found, not an error", async () => {
  const amapEmpty = await getPlaceDetail({
    provider: "amap", providerPoiId: "gone",
    env: { AMAP_DETAIL_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    fetcher: async () => Response.json({ status: "1", infocode: "10000", pois: [] }),
  });
  assert.equal(amapEmpty.status, "not_found");

  const tencentEmpty = await getPlaceDetail({
    provider: "tencent", providerPoiId: "gone",
    env: { TENCENT_MAP_DETAIL_ENABLED: "true", TENCENT_MAP_WEB_SERVICE_KEY: "secret" },
    fetcher: async () => Response.json({ status: 0, message: "query ok", result: null }),
  });
  assert.equal(tencentEmpty.status, "not_found");
});

test("provider rejection carries the code but never the message", async () => {
  const outcome = await getPlaceDetail({
    provider: "amap", providerPoiId: "x",
    env: { AMAP_DETAIL_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    fetcher: async () => Response.json({ status: "0", infocode: "20003", info: "secret-should-not-leak" }),
  });
  assert.deepEqual(outcome, { status: "provider_rejected", code: "20003" });
});

test("oversized response and transport failure are classified without retry", async () => {
  const oversized = await getPlaceDetail({
    provider: "amap", providerPoiId: "x",
    env: { AMAP_DETAIL_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    fetcher: async () => new Response("x".repeat(limits.responseBytes + 1)),
  });
  assert.equal(oversized.status, "transport_or_response_error");

  const transport = await getPlaceDetail({
    provider: "amap", providerPoiId: "x",
    env: { AMAP_DETAIL_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    fetcher: async () => { throw new Error("secret URL leaked"); },
  });
  assert.equal(transport.status, "transport_or_response_error");
});

test("http error status is classified with the observed status code", async () => {
  const outcome = await getPlaceDetail({
    provider: "amap", providerPoiId: "x",
    env: { AMAP_DETAIL_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" },
    fetcher: async () => new Response("", { status: 503 }),
  });
  assert.deepEqual(outcome, { status: "http_error", httpStatus: 503 });
});
