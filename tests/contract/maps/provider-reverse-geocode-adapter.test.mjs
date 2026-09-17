import test from "node:test";
import assert from "node:assert/strict";
import { reverseGeocode } from "../../../lib/server/maps/provider-reverse-geocode-adapter.ts";

test("#363 reverse geocode uses explicit GCJ02 lng,lat and never dispatches while disabled", async () => {
  const location = { lat: 39.991957, lng: 116.310003, system: "gcj02" };
  const disabled = await reverseGeocode({ provider: "amap", location, env: {}, fetcher: () => { throw new Error("must not call"); } });
  assert.deepEqual(disabled, { status: "UNRUN", reason: "disabled" });
  const observed = await reverseGeocode({ provider: "amap", location, env: { AMAP_REVERSE_GEOCODE_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" }, fetcher: async url => {
    assert.equal(url.pathname, "/v3/geocode/regeo"); assert.equal(url.searchParams.get("location"), "116.310003,39.991957");
    return Response.json({ status: "1", infocode: "10000", regeocode: { formatted_address: "北京市海淀区" } });
  } });
  assert.deepEqual(observed, { status: "observed", result: { provider: "amap", formattedAddress: "北京市海淀区" } });
});

test("#363 reverse geocode rejects WGS84 and does not invent an address", async () => {
  const outcome = await reverseGeocode({ provider: "amap", location: { lat: 39.9, lng: 116.3, system: "wgs84" }, env: { AMAP_REVERSE_GEOCODE_ENABLED: "true", AMAP_WEB_SERVICE_KEY: "secret" }, fetcher: () => { throw new Error("must not call"); } });
  assert.deepEqual(outcome, { status: "invalid_response" });
});
