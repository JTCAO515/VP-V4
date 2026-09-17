import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("app/api/places/native/v1/search/route.ts", "utf8");

test("#363 native place search keeps the native identity and active-session fences", () => {
  assert.match(source, /verifyNativeCredentials\(request, config, scope\.fetch, scope\.unavailable\)/);
  assert.match(source, /native_session_v2/);
  assert.match(source, /session\.data\?\.subject !== credentials\.subject/);
  assert.match(source, /session\.data\?\.sessionId !== credentials\.sessionId/);
  assert.match(source, /request\.headers\.has\("cookie"\) \|\| request\.headers\.has\("origin"\)/);
});

test("#363 native place search consumes the existing mapped search composition without exposing provider secrets", () => {
  assert.match(source, /searchPlacesWithCanonicalMapping/);
  assert.match(source, /createMapsServiceRoleClient\(\)/);
  assert.doesNotMatch(source, /AMAP_WEB_SERVICE_KEY|TENCENT_MAP_WEB_SERVICE_KEY|TENCENT_MAP_SK|SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(source, /Cache-Control": "private, no-store"/);
});
