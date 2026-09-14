import { openSync, writeSync, closeSync, fsyncSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { summarize, limits as singleLimits, tencentSig } from "./probe.mjs";

// Four-city pilot slice toward #362's full 120-query/40-route acceptance.
// Query text names real, well-known public landmarks. from/to coordinates
// are approximate synthetic offsets (not verified precise entrances or
// second landmarks), same "public synthetic" framing as probe.mjs's own
// single Beijing fixture. This is a bounded pilot, not the full matrix.
export const HARD_CAP_REQUESTS = 40;

const config = {
  amap: { key: "AMAP_WEB_SERVICE_KEY", flag: "AMAP_PROBE_ENABLED", host: "restapi.amap.com" },
  tencent: { key: "TENCENT_MAP_WEB_SERVICE_KEY", flag: "TENCENT_MAP_PROBE_ENABLED", host: "apis.map.qq.com", sk: "TENCENT_MAP_SK" },
};

const ALL_OPERATIONS = ["search", "walking"];

/**
 * `operations` selects which of search/walking this fixture dispatches —
 * defaults to both (the original paired pilot shape) for backward
 * compatibility with scripts/maps/pilot-fixtures.json. A search-only
 * fixture needs no from/to; a walking-only fixture needs no query/city
 * beyond what search would otherwise require. This lets a full
 * search-name matrix (many language variants, no route) and a separate
 * route matrix (place-to-place walking, no repeated search) share one
 * fixture file format without wasting the other half of each pair.
 */
function isFixture(f) {
  if (!f || typeof f !== "object" || typeof f.city !== "string" || typeof f.category !== "string") return false;
  const operations = f.operations ?? ALL_OPERATIONS;
  if (!Array.isArray(operations) || operations.length === 0 || !operations.every(o => ALL_OPERATIONS.includes(o))
    || new Set(operations).size !== operations.length) return false;
  if (operations.includes("search") && !(typeof f.query === "string" && f.query.trim())) return false;
  if (operations.includes("walking") && !(Number.isFinite(f?.from?.lat) && Number.isFinite(f?.from?.lng)
    && Number.isFinite(f?.to?.lat) && Number.isFinite(f?.to?.lng))) return false;
  return true;
}

export function loadFixtures(raw) {
  const list = JSON.parse(raw);
  if (!Array.isArray(list) || list.length === 0 || !list.every(isFixture)) throw new Error("invalid_fixtures");
  return list;
}

export function fixtureRequestCount(fixtures) {
  return fixtures.reduce((n, f) => n + (f.operations ?? ALL_OPERATIONS).length, 0);
}

export function requestsForFixture(provider, key, fx, sk) {
  const c = Object.hasOwn(config, provider) ? config[provider] : null;
  if (!c || typeof key !== "string" || !key.trim()) throw new Error("invalid_config");
  if (!isFixture(fx)) throw new Error("invalid_fixtures");
  const coordinate = p => provider === "amap" ? `${p.lng},${p.lat}` : `${p.lat},${p.lng}`;
  const build = op => {
    const [path, params] = op === "search"
      ? (provider === "amap"
        ? ["/v5/place/text", { keywords: fx.query, region: fx.city, city_limit: "true", page_size: "3", page_num: "1" }]
        : ["/ws/place/v1/search", { keyword: fx.query, boundary: `region(${fx.city},0)`, page_size: "3", page_index: "1" }])
      : (provider === "amap"
        ? ["/v5/direction/walking", { origin: coordinate(fx.from), destination: coordinate(fx.to), show_fields: "cost", alternative_route: "1" }]
        : ["/ws/direction/v1/walking", { from: coordinate(fx.from), to: coordinate(fx.to) }]);
    const allParams = { ...params, key, output: "json" };
    if (provider === "tencent" && sk) allParams.sig = tencentSig(path, allParams, sk);
    const url = new URL(`https://${c.host}${path}`);
    url.search = new URLSearchParams(allParams).toString();
    return { operation: op, url, city: fx.city, category: fx.category, query: fx.query };
  };
  return (fx.operations ?? ALL_OPERATIONS).map(build);
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

export const MAX_DELAY_MS = 5000;

export async function runBatchProbe({ provider, env, fixtures, record, fetcher = fetch, delayMs = 0, sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  const c = Object.hasOwn(config, provider) ? config[provider] : null;
  if (!c) throw new Error("invalid_provider");
  if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > MAX_DELAY_MS) throw new Error("invalid_delay");
  if (env[c.flag] !== "true" || !env[c.key]?.trim()) {
    record({ status: "UNRUN", reason: env[c.flag] !== "true" ? "disabled" : "missing_secure_credential", requests: 0 });
    return false;
  }
  const sk = c.sk ? env[c.sk] : undefined;
  const allRequests = fixtures.flatMap(fx => requestsForFixture(provider, env[c.key], fx, sk));
  if (allRequests.length > HARD_CAP_REQUESTS) throw new Error("fixture_budget_exceeds_hard_cap");
  let count = 0;
  let allObserved = true;
  for (const request of allRequests) {
    count += 1;
    if (count > 1 && delayMs > 0) await sleep(delayMs);
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
      requestNumber: count, of: allRequests.length, elapsedMs: Date.now() - started, delayMs,
      ...result, charge: "unknown; reconcile account usage", retainedRawResponse: false });
    if (result.status !== "observed") allObserved = false;
  }
  return allObserved;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let fd;
  try {
    const [provider, ledger, fixturesPath, delayArg, ...extra] = process.argv.slice(2);
    if (!Object.hasOwn(config, provider) || !ledger || !fixturesPath || extra.length) throw new Error("usage");
    const delayMs = delayArg === undefined ? 0 : Number(delayArg);
    if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > MAX_DELAY_MS) throw new Error("invalid_delay");
    const fixtures = loadFixtures(readFileSync(fixturesPath, "utf8"));
    if (fixtureRequestCount(fixtures) > HARD_CAP_REQUESTS) throw new Error("fixture_budget_exceeds_hard_cap");
    fd = openSync(ledger, "wx", 0o600);
    const record = value => { writeSync(fd, JSON.stringify(value) + "\n"); fsyncSync(fd); };
    const c = config[provider];
    record({ schemaVersion: "map-batch-probe/1", scriptSha256: createHash("sha256").update(readFileSync(new URL(import.meta.url))).digest("hex"),
      fixturesPath, fixtureCount: fixtures.length, coordinateSystem: "GCJ-02", hardCapRequests: HARD_CAP_REQUESTS, delayMs,
      signed: Boolean(c.sk && process.env[c.sk]?.trim()),
      scope: "named public landmarks; synthetic from/to offsets; server API only", clientMapLoading: "UNRUN" });
    const ok = await runBatchProbe({ provider, env: process.env, fixtures, record, delayMs });
    console.log(JSON.stringify({ status: ok ? "ALL_OBSERVED" : "INCOMPLETE", provider, fixtureCount: fixtures.length, rawOutput: "suppressed" }));
    if (!ok) process.exitCode = 1;
  } catch {
    console.error("Batch probe stopped. Inspect the existing ledger; do not rerun an uncertain dispatch. Usage: node scripts/maps/batch-probe.mjs <amap|tencent> <new-ledger-path> <fixtures.json> [delayMs<=5000]");
    process.exitCode = 1;
  } finally { if (fd !== undefined) closeSync(fd); }
}
