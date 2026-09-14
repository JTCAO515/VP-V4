import { openSync, writeSync, closeSync, fsyncSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

// Public, synthetic Beijing endpoints. These are not verified POI entrances.
export const fixture = Object.freeze({
  query: "北京大学", city: "北京市",
  from: Object.freeze({ lat: 39.984042, lng: 116.307535 }),
  to: Object.freeze({ lat: 39.976249, lng: 116.316569 }),
});
export const limits = Object.freeze({ requests: 2, retries: 0, matrixElements: 0, timeoutMs: 15000, responseBytes: 262144 });
const config = {
  amap: { key: "AMAP_WEB_SERVICE_KEY", flag: "AMAP_PROBE_ENABLED", host: "restapi.amap.com" },
  tencent: { key: "TENCENT_MAP_WEB_SERVICE_KEY", flag: "TENCENT_MAP_PROBE_ENABLED", host: "apis.map.qq.com", sk: "TENCENT_MAP_SK" },
};

// Tencent WebService "sig" (SN) verification, per lbs.qq.com's own documented
// algorithm: md5(path + "?" + ascending-sorted-by-name unencoded params + SK).
// Verified against the docs' own worked example before use on any real key.
export function tencentSig(path, params, sk) {
  const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join("&");
  return createHash("md5").update(`${path}?${sorted}${sk}`, "utf8").digest("hex");
}

export function requests(provider, key, sk) {
  const c = Object.hasOwn(config, provider) ? config[provider] : null;
  if (!c || typeof key !== "string" || !key.trim()) throw new Error("invalid_config");
  const coordinate = p => provider === "amap" ? `${p.lng},${p.lat}` : `${p.lat},${p.lng}`;
  const search = provider === "amap"
    ? ["/v5/place/text", { keywords: fixture.query, region: fixture.city, city_limit: "true", page_size: "3", page_num: "1" }]
    : ["/ws/place/v1/search", { keyword: fixture.query, boundary: `region(${fixture.city},0)`, page_size: "3", page_index: "1" }];
  const walking = provider === "amap"
    ? ["/v5/direction/walking", { origin: coordinate(fixture.from), destination: coordinate(fixture.to), show_fields: "cost", alternative_route: "1" }]
    : ["/ws/direction/v1/walking", { from: coordinate(fixture.from), to: coordinate(fixture.to) }];
  return [search, walking].map(([path, params], i) => {
    const allParams = { ...params, key, output: "json" };
    if (provider === "tencent" && sk) allParams.sig = tencentSig(path, allParams, sk);
    const url = new URL(`https://${c.host}${path}`);
    url.search = new URLSearchParams(allParams).toString();
    return { operation: i === 0 ? "search" : "walking", url };
  });
}

const numeric = value => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\d+(\.\d+)?$/.test(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
export function summarize(provider, operation, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { status: "invalid_response" };
  const ok = provider === "amap" ? body.status === "1" && body.infocode === "10000" : body.status === 0;
  if (!ok) {
    const code = provider === "amap" ? body.infocode : body.status;
    // Never persist provider messages, which may echo request URLs or keys.
    return { status: "provider_rejected", code: /^\d{1,8}$/.test(String(code)) ? String(code) : null };
  }
  if (operation === "search") {
    const rows = provider === "amap" ? body.pois : body.data;
    if (!Array.isArray(rows)) return { status: "invalid_response" };
    return { status: rows.length ? "observed" : "no_results", count: rows.length,
      identityFieldsPresent: rows.slice(0, 3).every(p => p && typeof p.id === "string" && typeof (p.name ?? p.title) === "string"),
      entityMatch: "UNRUN", entranceAccuracy: "UNRUN" };
  }
  const rows = provider === "amap" ? body.route?.paths : body.result?.routes;
  if (!Array.isArray(rows)) return { status: "invalid_response" };
  const routes = rows.slice(0, 3).map(p => ({ distanceMeters: numeric(p?.distance),
    durationSeconds: provider === "amap" ? numeric(p?.cost?.duration) : numeric(p?.duration) === null ? null : numeric(p.duration) * 60 }));
  return { status: rows.length ? "observed" : "no_results", routes, routeExecutability: "UNRUN" };
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
      if (bytes > limits.responseBytes) throw new Error("response_too_large");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { await reader.cancel().catch(() => {}); }
}

export async function runProbe({ provider, env, record, fetcher = fetch }) {
  const c = Object.hasOwn(config, provider) ? config[provider] : null;
  if (!c) throw new Error("invalid_provider");
  if (env[c.flag] !== "true" || !env[c.key]?.trim()) {
    record({ status: "UNRUN", reason: env[c.flag] !== "true" ? "disabled" : "missing_secure_credential", requests: 0 });
    return false;
  }
  let count = 0;
  for (const request of requests(provider, env[c.key], c.sk ? env[c.sk] : undefined)) {
    count += 1;
    if (count > limits.requests) throw new Error("request_budget");
    const started = Date.now();
    // Durable admission precedes dispatch. Reuse of this run's ledger is rejected by the CLI.
    record({ phase: "admitted", provider, operation: request.operation, requestNumber: count, at: new Date().toISOString() });
    let result;
    try {
      const response = await fetcher(request.url, { method: "GET", redirect: "error", signal: AbortSignal.timeout(limits.timeoutMs) });
      result = response.ok ? summarize(provider, request.operation, await boundedJson(response)) : { status: "http_error", httpStatus: response.status };
      if (!response.ok) await response.body?.cancel();
    } catch (error) {
      result = { status: error?.name === "TimeoutError" ? "timeout" : "transport_or_response_error" };
    }
    record({ phase: "returned", provider, operation: request.operation, requestNumber: count, elapsedMs: Date.now() - started,
      ...result, charge: "unknown; reconcile account usage", retainedRawResponse: false });
    if (result.status !== "observed") return false;
  }
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let fd;
  try {
    const [provider, ledger, ...extra] = process.argv.slice(2);
    if (!Object.hasOwn(config, provider) || !ledger || extra.length) throw new Error("usage");
    fd = openSync(ledger, "wx", 0o600);
    const record = value => { writeSync(fd, JSON.stringify(value) + "\n"); fsyncSync(fd); };
    const c = config[provider];
    record({ schemaVersion: "map-initial-probe/1", scriptSha256: createHash("sha256").update(readFileSync(new URL(import.meta.url))).digest("hex"), fixture, coordinateSystem: "GCJ-02", limits,
      signed: Boolean(c.sk && process.env[c.sk]?.trim()),
      scope: "public synthetic inputs; server API only", clientMapLoading: "UNRUN" });
    const ok = await runProbe({ provider, env: process.env, record });
    console.log(JSON.stringify({ status: ok ? "API_OBSERVED" : "INCOMPLETE", provider, rawOutput: "suppressed" }));
    if (!ok) process.exitCode = 1;
  } catch { console.error("Probe stopped. Inspect the existing ledger; do not rerun an uncertain dispatch. Usage: node scripts/maps/probe.mjs <amap|tencent> <new-ledger-path>"); process.exitCode = 1; }
  finally { if (fd !== undefined) closeSync(fd); }
}
