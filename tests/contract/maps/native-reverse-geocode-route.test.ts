import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync("app/api/places/native/v1/reverse-geocode/route.ts", "utf8");
test("#363 native reverse-geocode retains native identity and GCJ02 guards", () => {
  assert.match(source, /verifyNativeCredentials\(request, config, scope\.fetch, scope\.unavailable\)/);
  assert.match(source, /native_session_v2/);
  assert.match(source, /system !== "gcj02"/);
  assert.match(source, /reverseGeocode/);
  assert.doesNotMatch(source, /AMAP_WEB_SERVICE_KEY|TENCENT_MAP_WEB_SERVICE_KEY|TENCENT_MAP_SK|SUPABASE_SERVICE_ROLE_KEY/);
});
