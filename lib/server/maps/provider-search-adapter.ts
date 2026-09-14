import { createHash } from "node:crypto";
import type { PlaceSearchCandidate, Provider } from "./place-identity";

/**
 * Runtime place-search transport for #363. Deliberately narrow: one
 * provider per call, no cross-provider fallback or retry (that orchestration
 * is #367's job, not this slice's). No persistence, no candidate-to-
 * canonical matching decision — `lookupMapping` only answers "does this
 * provider id already have a mapping", supplied by the caller so this module
 * stays DB-free and unit-testable, mirroring
 * lib/server/external-evidence/resolver.ts's separation of pure decision
 * logic from transport/persistence.
 */

export type SearchOutcome =
  | Readonly<{ status: "observed"; candidates: readonly PlaceSearchCandidate[] }>
  | Readonly<{ status: "no_results" }>
  | Readonly<{ status: "provider_rejected"; code: string | null }>
  | Readonly<{ status: "invalid_response" }>
  | Readonly<{ status: "http_error"; httpStatus: number }>
  | Readonly<{ status: "timeout" }>
  | Readonly<{ status: "transport_or_response_error" }>
  | Readonly<{ status: "UNRUN"; reason: "disabled" | "missing_secure_credential" }>;

export const limits = Object.freeze({ timeoutMs: 15000, responseBytes: 262144, maxCandidates: 20 });

const config: Record<Provider, Readonly<{ envKey: string; envFlag: string; host: string; envSk?: string }>> = {
  amap: { envKey: "AMAP_WEB_SERVICE_KEY", envFlag: "AMAP_SEARCH_ENABLED", host: "restapi.amap.com" },
  tencent: { envKey: "TENCENT_MAP_WEB_SERVICE_KEY", envFlag: "TENCENT_MAP_SEARCH_ENABLED", host: "apis.map.qq.com", envSk: "TENCENT_MAP_SK" },
};

/**
 * Must stay identical to scripts/maps/probe.mjs's tencentSig — both are
 * verified independently against lbs.qq.com's own documented worked example
 * (see tests/contract/maps/provider-search-adapter.test.mjs and
 * tests/contract/maps/initial-probe.test.mjs). Small, deliberate duplication
 * across the dev-probe script and this runtime module rather than a shared
 * import across the scripts/lib boundary.
 */
export function tencentSig(path: string, params: Record<string, string>, sk: string): string {
  const sorted = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  return createHash("md5").update(`${path}?${sorted}${sk}`, "utf8").digest("hex");
}

function buildRequest(provider: Provider, key: string, sk: string | undefined, query: string, city: string): { url: URL } {
  const host = config[provider].host;
  const [path, params]: [string, Record<string, string>] = provider === "amap"
    ? ["/v5/place/text", { keywords: query, region: city, city_limit: "true", page_size: String(limits.maxCandidates), page_num: "1" }]
    : ["/ws/place/v1/search", { keyword: query, boundary: `region(${city},0)`, page_size: String(limits.maxCandidates), page_index: "1" }];
  const allParams: Record<string, string> = { ...params, key, output: "json" };
  if (provider === "tencent" && sk) allParams.sig = tencentSig(path, allParams, sk);
  const url = new URL(`https://${host}${path}`);
  url.search = new URLSearchParams(allParams).toString();
  return { url };
}

function normalizeCandidates(provider: Provider, body: Record<string, unknown>, lookupMapping: (provider: Provider, providerPoiId: string) => string | null): { status: "observed" | "no_results" | "invalid_response"; candidates?: readonly PlaceSearchCandidate[] } {
  const rows = provider === "amap" ? body.pois : body.data;
  if (!Array.isArray(rows)) return { status: "invalid_response" };
  if (rows.length === 0) return { status: "no_results" };
  const candidates: PlaceSearchCandidate[] = [];
  for (const row of rows.slice(0, limits.maxCandidates)) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const providerPoiId = typeof r.id === "string" ? r.id : null;
    const rawName = typeof (r.name ?? r.title) === "string" ? String(r.name ?? r.title) : null;
    if (!providerPoiId || !rawName) continue;
    candidates.push(Object.freeze({ provider, providerPoiId, rawName, matchedCanonicalPoiId: lookupMapping(provider, providerPoiId) }));
  }
  return candidates.length > 0 ? { status: "observed", candidates: Object.freeze(candidates) } : { status: "invalid_response" };
}

async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("invalid_response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limits.responseBytes) throw new Error("response_too_large");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export async function searchPlaces(input: {
  provider: Provider;
  query: string;
  city: string;
  env: Readonly<Record<string, string | undefined>>;
  lookupMapping: (provider: Provider, providerPoiId: string) => string | null;
  fetcher?: typeof fetch;
}): Promise<SearchOutcome> {
  const { provider, query, city, env, lookupMapping, fetcher = fetch } = input;
  const c = config[provider];
  if (env[c.envFlag] !== "true") return { status: "UNRUN", reason: "disabled" };
  const key = env[c.envKey];
  if (typeof key !== "string" || !key.trim()) return { status: "UNRUN", reason: "missing_secure_credential" };
  const sk = c.envSk ? env[c.envSk] : undefined;
  const { url } = buildRequest(provider, key, sk, query, city);
  let response: Response;
  try {
    response = await fetcher(url, { method: "GET", redirect: "error", signal: AbortSignal.timeout(limits.timeoutMs) });
  } catch (error) {
    return { status: (error as Error)?.name === "TimeoutError" ? "timeout" : "transport_or_response_error" };
  }
  if (!response.ok) return { status: "http_error", httpStatus: response.status };
  let body: unknown;
  try {
    body = await boundedJson(response);
  } catch {
    return { status: "transport_or_response_error" };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return { status: "invalid_response" };
  const b = body as Record<string, unknown>;
  const ok = provider === "amap" ? b.status === "1" && b.infocode === "10000" : b.status === 0;
  if (!ok) {
    const code = provider === "amap" ? b.infocode : b.status;
    return { status: "provider_rejected", code: /^\d{1,8}$/.test(String(code)) ? String(code) : null };
  }
  const normalized = normalizeCandidates(provider, b, lookupMapping);
  return normalized.status === "observed" ? { status: "observed", candidates: normalized.candidates! } : { status: normalized.status };
}
