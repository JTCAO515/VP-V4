/**
 * Runtime input-tip/autocomplete transport for #363's "统一服务端适配搜索/
 * 详情/地址/建议" bullet — the "suggest" (input-tip/autocomplete) half that
 * search/detail/geocode already left as future work (see
 * docs/contracts/place-identity.md's non-goals). Nearby-category search and
 * reverse-geocode remain separate future slices, not this one.
 *
 * Same shape as its siblings: one provider per call, no cross-provider
 * fallback or retry (#367's job), no persistence, no canonical matching
 * decision — this module has no `lookupMapping` parameter at all, because a
 * provider's input-tip response can legitimately have no backing POI id (a
 * plain keyword/history suggestion), so there is nothing to match against a
 * canonical place yet. Reuses provider-search-adapter.ts's `boundedJson`
 * response-size guard and `tencentSig` signing function rather than
 * duplicating security-relevant transport code.
 *
 * The location this module returns is intentionally opaque about its
 * coordinate system beyond the provider's own documented default (GCJ02 for
 * both AMap and Tencent web-service responses unless a different
 * `coord_type`/`output` parameter is requested, which this module never
 * does) — combining it with a WGS84 source still requires
 * coordinate-conversion.ts's explicit, non-double-applying conversion.
 *
 * Provider request/response shapes (`/v3/assistant/inputtips`,
 * `/ws/place/v1/suggestion`) are taken from AMap Input Tips API and Tencent
 * WebService Suggestion API's public documentation (see
 * docs/agents/maps-integration-development.md's source list); no real
 * account call against these specific endpoints has been made in this
 * environment — that live verification is UNRUN, tracked the same way
 * #362/#363's prior adapters already distinguish documented-shape from
 * observed-response evidence.
 */

import type { CoordinateSystem, Provider } from "./place-identity.ts";
import { boundedJson, limits, tencentSig } from "./provider-search-adapter.ts";

export type SuggestCandidate = Readonly<{
  provider: Provider;
  /**
   * null when the provider's tip carries no backing POI id — AMap's
   * `inputtips` documents this for plain keyword/history suggestions that
   * are not yet a specific place. Never invented to make the row look like
   * a matchable POI.
   */
  providerPoiId: string | null;
  rawName: string;
  /** null when the provider response omits a parseable coordinate for this tip — never a fabricated 0,0 guess. */
  location: Readonly<{ lat: number; lng: number; coordinateSystem: CoordinateSystem }> | null;
}>;

export type SuggestOutcome =
  | Readonly<{ status: "observed"; candidates: readonly SuggestCandidate[] }>
  | Readonly<{ status: "no_results" }>
  | Readonly<{ status: "provider_rejected"; code: string | null }>
  | Readonly<{ status: "invalid_response" }>
  | Readonly<{ status: "http_error"; httpStatus: number }>
  | Readonly<{ status: "timeout" }>
  | Readonly<{ status: "transport_or_response_error" }>
  | Readonly<{ status: "UNRUN"; reason: "disabled" | "missing_secure_credential" }>;

/**
 * Both AMap and Tencent web-service suggest responses default to GCJ02 —
 * neither provider is asked for a different `coord_type`/`output` coordinate
 * system here, so this constant documents the observed default rather than
 * inferring it per response.
 */
const DEFAULT_LOCATION_SYSTEM: CoordinateSystem = "gcj02";

const config: Record<Provider, Readonly<{ envKey: string; envFlag: string; host: string; envSk?: string }>> = {
  amap: { envKey: "AMAP_WEB_SERVICE_KEY", envFlag: "AMAP_SUGGEST_ENABLED", host: "restapi.amap.com" },
  tencent: { envKey: "TENCENT_MAP_WEB_SERVICE_KEY", envFlag: "TENCENT_MAP_SUGGEST_ENABLED", host: "apis.map.qq.com", envSk: "TENCENT_MAP_SK" },
};

function buildRequest(provider: Provider, key: string, sk: string | undefined, query: string, city: string | undefined): { url: URL } {
  const host = config[provider].host;
  const baseParams: Record<string, string> = provider === "amap" ? { keywords: query } : { keyword: query };
  if (city) {
    if (provider === "amap") {
      baseParams.city = city;
      baseParams.citylimit = "true";
    } else {
      baseParams.region = city;
    }
  }
  const path = provider === "amap" ? "/v3/assistant/inputtips" : "/ws/place/v1/suggestion";
  const allParams: Record<string, string> = { ...baseParams, key, output: "json" };
  if (provider === "tencent" && sk) allParams.sig = tencentSig(path, allParams, sk);
  const url = new URL(`https://${host}${path}`);
  url.search = new URLSearchParams(allParams).toString();
  return { url };
}

/**
 * AMap's `location` is a `"lng,lat"` string that can be an empty string for
 * a tip with no backing POI; Tencent's is a `{lat,lng}` object. Both parsed
 * defensively — no throw on malformed or absent input.
 */
function parseLocation(provider: Provider, raw: unknown): SuggestCandidate["location"] {
  if (provider === "amap") {
    if (typeof raw !== "string" || raw.length === 0) return null;
    const parts = raw.split(",");
    if (parts.length !== 2) return null;
    const lng = Number(parts[0]);
    const lat = Number(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return Object.freeze({ lat, lng, coordinateSystem: DEFAULT_LOCATION_SYSTEM });
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.lat !== "number" || typeof r.lng !== "number" || !Number.isFinite(r.lat) || !Number.isFinite(r.lng)) return null;
  return Object.freeze({ lat: r.lat, lng: r.lng, coordinateSystem: DEFAULT_LOCATION_SYSTEM });
}

function normalizeCandidates(provider: Provider, body: Record<string, unknown>): { status: "observed" | "no_results" | "invalid_response"; candidates?: readonly SuggestCandidate[] } {
  const rows = provider === "amap" ? body.tips : body.data;
  if (!Array.isArray(rows)) return { status: "invalid_response" };
  if (rows.length === 0) return { status: "no_results" };
  const candidates: SuggestCandidate[] = [];
  for (const row of rows.slice(0, limits.maxCandidates)) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const rawName = typeof (r.name ?? r.title) === "string" ? String(r.name ?? r.title) : null;
    if (!rawName) continue;
    const providerPoiId = typeof r.id === "string" && r.id.length > 0 ? r.id : null;
    candidates.push(Object.freeze({ provider, providerPoiId, rawName, location: parseLocation(provider, r.location) }));
  }
  return candidates.length > 0 ? { status: "observed", candidates: Object.freeze(candidates) } : { status: "invalid_response" };
}

export async function suggestPlaces(input: {
  provider: Provider;
  query: string;
  /** Optional disambiguation hint (AMap's `city`/Tencent's `region`); never required by this module. */
  city?: string;
  env: Readonly<Record<string, string | undefined>>;
  fetcher?: typeof fetch;
}): Promise<SuggestOutcome> {
  const { provider, query, city, env, fetcher = fetch } = input;
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
  const normalized = normalizeCandidates(provider, b);
  return normalized.status === "observed" ? { status: "observed", candidates: normalized.candidates! } : { status: normalized.status };
}
