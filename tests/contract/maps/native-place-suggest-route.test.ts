import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("app/api/places/native/v1/suggest/route.ts", "utf8");

test("#363 native input tips retain the native identity/session and credential boundaries", () => {
  assert.match(source, /suggestPlaces/);
  assert.match(source, /verifyNativeCredentials\(request, config, scope\.fetch, scope\.unavailable\)/);
  assert.match(source, /native_session_v2/);
  assert.match(source, /request\.headers\.has\("cookie"\) \|\| request\.headers\.has\("origin"\)/);
  assert.doesNotMatch(source, /AMAP_WEB_SERVICE_KEY|TENCENT_MAP_WEB_SERVICE_KEY|TENCENT_MAP_SK|SUPABASE_SERVICE_ROLE_KEY/);
});
