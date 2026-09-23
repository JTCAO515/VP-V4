import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  PLACE_QUOTA_LIMITS,
  consumePlaceQuota,
  enforcePlaceQuota,
  placeQuotaRejection,
  type QuotaRpcClient,
} from "../../../lib/server/maps/place-quota.ts";

type Call = { name: string; params: Record<string, unknown>; signal?: AbortSignal };

function fakeClient(result: () => Promise<{ data: unknown; error: unknown }>, calls: Call[] = []): QuotaRpcClient {
  return {
    rpc(name, params) {
      const call: Call = { name, params };
      calls.push(call);
      const pending = result();
      pending.catch(() => {});
      return Object.assign(pending, {
        abortSignal(signal: AbortSignal) { call.signal = signal; return pending; },
      });
    },
  };
}

test("thresholds are centralized and conservative", () => {
  assert.deepEqual(Object.keys(PLACE_QUOTA_LIMITS).sort(), ["map_proxy", "places"]);
  assert.ok(PLACE_QUOTA_LIMITS.places.perMinute <= 60 && PLACE_QUOTA_LIMITS.places.perDay <= 1000);
  assert.ok(PLACE_QUOTA_LIMITS.map_proxy.perMinute <= 1000 && PLACE_QUOTA_LIMITS.map_proxy.perDay <= 100000);
  for (const limits of Object.values(PLACE_QUOTA_LIMITS)) assert.ok(limits.perMinute >= 1 && limits.perDay >= limits.perMinute);
});

test("consumes via the caller's client with the configured limits and an abort signal", async () => {
  const calls: Call[] = [];
  const decision = await consumePlaceQuota(fakeClient(async () => ({ data: { allowed: true }, error: null }), calls), "places", new AbortController().signal);
  assert.deepEqual(decision, { kind: "allowed" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "consume_place_quota_v1");
  assert.deepEqual(calls[0].params, { p_bucket: "places", p_minute_limit: PLACE_QUOTA_LIMITS.places.perMinute, p_day_limit: PLACE_QUOTA_LIMITS.places.perDay });
  assert.ok(calls[0].signal instanceof AbortSignal);
  // The actor is never passed by the server: the database derives it from auth.uid().
  assert.ok(!Object.keys(calls[0].params).some(key => /actor|user|subject/i.test(key)));
});

test("over the limit → 429 RATE_LIMITED with Retry-After, private/no-store", async () => {
  const response = await enforcePlaceQuota(fakeClient(async () => ({ data: { allowed: false, retryAfterSeconds: 41.2 }, error: null })), "places");
  assert.ok(response);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "42");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), { error: { code: "RATE_LIMITED" } });
});

test("Retry-After is clamped to [1, 86400]", () => {
  assert.equal(placeQuotaRejection({ kind: "limited", retryAfterSeconds: 1 })?.headers.get("retry-after"), "1");
  return consumePlaceQuota(fakeClient(async () => ({ data: { allowed: false, retryAfterSeconds: 1e9 }, error: null })), "map_proxy")
    .then(decision => assert.deepEqual(decision, { kind: "limited", retryAfterSeconds: 86400 }));
});

test("fail-closed: RPC error, throw, malformed data or missing function → 503, never allowed", async () => {
  const cases: Array<() => Promise<{ data: unknown; error: unknown }>> = [
    async () => ({ data: null, error: { code: "PGRST202", message: "function not found" } }),
    async () => { throw new Error("network"); },
    async () => ({ data: "yes", error: null }),
    async () => ({ data: [{ allowed: true }], error: null }),
    async () => ({ data: { allowed: "true" }, error: null }),
    async () => ({ data: { allowed: false }, error: null }),
  ];
  for (const result of cases) {
    const response = await enforcePlaceQuota(fakeClient(result), "places");
    assert.ok(response);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("retry-after"), null);
    assert.deepEqual(await response.json(), { error: { code: "PROVIDER_UNAVAILABLE" } });
  }
});

test("allowed → null (caller proceeds)", async () => {
  assert.equal(await enforcePlaceQuota(fakeClient(async () => ({ data: { allowed: true }, error: null })), "map_proxy"), null);
});

test("quota module never logs and never uses a service credential", () => {
  const source = readFileSync("lib/server/maps/place-quota.ts", "utf8");
  assert.doesNotMatch(source, /console\.|SERVICE_ROLE|createMapsServiceRoleClient/);
});

const WEB_ROUTES: Array<[string, string, RegExp]> = [
  ["app/api/places/search/route.ts", "places", /searchPlacesWithCanonicalMapping\(/],
  ["app/api/places/nearby/route.ts", "places", /nearbySearchWithCanonicalMapping\(/],
  ["app/api/places/lookup/route.ts", "places", /lookupPlace\(/],
  ["app/api/maps/_AMapService/[...path]/route.ts", "map_proxy", /await fetch\(url/],
];
const NATIVE_ROUTES: Array<[string, RegExp]> = [
  ["app/api/places/native/v1/search/route.ts", /searchPlacesWithCanonicalMapping\(/],
  ["app/api/places/native/v1/suggest/route.ts", /suggestPlaces\(/],
  ["app/api/places/native/v1/lookup/route.ts", /lookupPlace\(/],
  ["app/api/places/native/v1/reverse-geocode/route.ts", /reverseGeocode\(/],
];

test("every Web places/maps provider route enforces the per-actor quota after auth and before the provider call", () => {
  for (const [path, bucket, providerCall] of WEB_ROUTES) {
    const source = readFileSync(path, "utf8");
    const auth = source.indexOf("requireAuthenticatedActor(request)");
    const quota = source.indexOf(`enforcePlaceQuota(actor.client, "${bucket}"`);
    const provider = source.search(providerCall);
    assert.ok(auth >= 0 && quota > auth && provider > quota, path);
    assert.match(source, /if \(quotaRejection\) return quotaRejection;/, path);
  }
});

test("every native places route enforces the quota after the active-session fence and before the provider call", () => {
  for (const [path, providerCall] of NATIVE_ROUTES) {
    const source = readFileSync(path, "utf8");
    const session = source.indexOf('"SESSION_REPLACED"');
    const quota = source.indexOf('enforcePlaceQuota(credentials.client, "places", scope.signal)');
    const provider = source.search(providerCall);
    assert.ok(session >= 0 && quota > session && provider > quota, path);
    assert.match(source, /if \(quotaRejection\) return quotaRejection;/, path);
  }
});

test("no places/maps provider route is left without the quota", () => {
  const covered = new Set([...WEB_ROUTES.map(([p]) => p), ...NATIVE_ROUTES.map(([p]) => p)]);
  const exempt = new Set(["app/api/maps/display-config/route.ts"]); // returns config only, no provider call
  const all = [
    ...readdirRoutes("app/api/places"),
    ...readdirRoutes("app/api/maps"),
  ];
  for (const path of all) assert.ok(covered.has(path) || exempt.has(path), `uncovered route ${path}`);
  assert.doesNotMatch(readFileSync("app/api/maps/display-config/route.ts", "utf8"), /fetch\(/);
});

function readdirRoutes(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name === "route.ts")
    .map(entry => `${entry.parentPath}/${entry.name}`);
}
