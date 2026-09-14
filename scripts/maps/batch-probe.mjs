import { openSync, writeSync, closeSync, fsyncSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { summarize, limits as singleLimits } from "./probe.mjs";

// Four-city pilot slice toward #362's full 120-query/40-route acceptance.
// Query text names real, well-known public landmarks. from/to coordinates
// are approximate synthetic offsets (not verified precise entrances or
// second landmarks), same "public synthetic" framing as probe.mjs's own
// single Beijing fixture. This is a bounded pilot, not the full matrix.
export const HARD_CAP_REQUESTS = 40;

const config = {
  amap: { key: "AMAP_WEB_SERVICE_KEY", flag: "AMAP_PROBE_ENABLED", host: "restapi.amap.com" },
  tencent: { key: "TENCENT_MAP_WEB_SERVICE_KEY", flag: "TENCENT_MAP_PROBE_ENABLED", host: "apis.map.qq.com" },
};

function isFixture(f) {
  return f && typeof f === "object" && typeof f.city === "string" && typeof f.category === "string" &&
    typeof f.query === "string" && f.query.trim() &&
    Number.isFinite(f?.from?.lat) && Number.isFinite(f?.from?.lng) &&
    Number.isFinite(f?.to?.lat) && Number.isFinite(f?.to?.lng);
}

export function loadFixtures(raw) {
  const list = JSON.parse(raw);
  if (!Array.isArray(list) || list.length === 0 || !list.every(isFixture)) throw new Error("invalid_fixtures");
  return list;
}

export function requestsForFixture(provider, key, fx) {
  const c = Object.hasOwn(config, provider) ? config[provider] : null;
  if (!c || typeof key !== "string" || !key.trim()) throw new Error("invalid_config");
  if (!isFixture(fx)) throw new Error("invalid_fixtures");
  const coordinate = p => provider === "amap" ? `${p.lng},${p.lat}` : `${p.lat},${p.lng}`;
  const search = provider === "amap"
    ? ["/v5/place/text", { keywords: fx.query, region: fx.city, city_limit: "true", page_size: "3", page_num: "1" }]
    : ["/ws/place/v1/search", { keyword: fx.query, boundary: `region(${fx.city},0)`, page_size: "3", page_index: "1" }];
  const walking = provider === "amap"
    ? ["/v5/direction/walking", { origin: coordinate(fx.from), destination: coordinate(fx.to), show_fields: "cost", alternative_route: "1" }]
    : ["/ws/direction/v1/walking", { from: coordinate(fx.from), to: coordinate(fx.to) }];
  return [search, walking].map(([path, params], i) => {
    const url = new URL(`https://${c.host}${path}`);
    url.search = new URLSearchParams({ ...params, key, output: "json" }).toString();
    return { operation: i === 0 ? "search" : "walking", url, city: fx.city, category: fx.category, query: fx.query };
  });
}

async function boundedJson(response) {
  if (!response.body) throw new Error("invalid_response");
  const reader = response.body.getReader();
  const chunks = []; let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > singleLimits.responseBytes) throw new Error("response_too_large");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { await reader.cancel().catch(() => {}); }
}

export async function runBatchProbe({ provider, env, fixtures, record, fetcher = fetch }) {
  const c = Object.hasOwn(config, provider) ? config[provider] : null;
  if (!c) throw new Error("invalid_provider");
  if (env[c.flag] !== "true" || !env[c.key]?.trim()) {
    record({ status: "UNRUN", reason: env[c.flag] !== "true" ? "disabled" : "missing_secure_credential", requests: 0 });
    return false;
  }
  const allRequests = fixtures.flatMap(fx => requestsForFixture(provider, env[c.key], fx));
  if (allRequests.length > HARD_CAP_REQUESTS) throw new Error("fixture_budget_exceeds_hard_cap");
  let count = 0;
  let allObserved = true;
  for (const request of allRequests) {
    count += 1;
    const started = Date.now();
    record({ phase: "admitted", provider, operation: request.operation, city: request.city, category: request.category,
      requestNumber: count, of: allRequests.length, at: new Date().toISOString() });
    let result;
    try {
      const response = await fetcher(request.url, { method: "GET", redirect: "error", signal: AbortSignal.timeout(singleLimits.timeoutMs) });
      result = response.ok ? summarize(provider, request.operation, await boundedJson(response)) : { status: "http_error", httpStatus: response.status };
      if (!response.ok) await response.body?.cancel();
    } catch (error) {
      result = { status: error?.name === "TimeoutError" ? "timeout" : "transport_or_response_error" };
    }
    record({ phase: "returned", provider, operation: request.operation, city: request.city, category: request.category,
      requestNumber: count, of: allRequests.length, elapsedMs: Date.now() - started,
      ...result, charge: "unknown; reconcile account usage", retainedRawResponse: false });
    if (result.status !== "observed") allObserved = false;
  }
  return allObserved;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let fd;
  try {
    const [provider, ledger, fixturesPath, ...extra] = process.argv.slice(2);
    if (!Object.hasOwn(config, provider) || !ledger || !fixturesPath || extra.length) throw new Error("usage");
    const fixtures = loadFixtures(readFileSync(fixturesPath, "utf8"));
    if (fixtures.length * 2 > HARD_CAP_REQUESTS) throw new Error("fixture_budget_exceeds_hard_cap");
    fd = openSync(ledger, "wx", 0o600);
    const record = value => { writeSync(fd, JSON.stringify(value) + "\n"); fsyncSync(fd); };
    record({ schemaVersion: "map-batch-probe/1", scriptSha256: createHash("sha256").update(readFileSync(new URL(import.meta.url))).digest("hex"),
      fixturesPath, fixtureCount: fixtures.length, coordinateSystem: "GCJ-02", hardCapRequests: HARD_CAP_REQUESTS,
      scope: "named public landmarks; synthetic from/to offsets; server API only", clientMapLoading: "UNRUN" });
    const ok = await runBatchProbe({ provider, env: process.env, fixtures, record });
    console.log(JSON.stringify({ status: ok ? "ALL_OBSERVED" : "INCOMPLETE", provider, fixtureCount: fixtures.length, rawOutput: "suppressed" }));
    if (!ok) process.exitCode = 1;
  } catch {
    console.error("Batch probe stopped. Inspect the existing ledger; do not rerun an uncertain dispatch. Usage: node scripts/maps/batch-probe.mjs <amap|tencent> <new-ledger-path> <fixtures.json>");
    process.exitCode = 1;
  } finally { if (fd !== undefined) closeSync(fd); }
}
