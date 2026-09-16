/**
 * Runtime nearby-category-search transport for #363's "周边厕所/便利店/
 * 餐饮/药店/ATM分类可查，特殊服务未知不推断" acceptance bullet, and the
 * execution row's "统一服务端适配搜索/详情/地址/建议" bullet's remaining
 * "nearby-category" half — search, detail, forward geocode and suggest
 * already exist (see docs/contracts/place-identity.md's non-goals list);
 * route/matrix/nav-handoff and reverse geocode remain separate future
 * slices, not this one.
 *
 * Same shape as its siblings: one provider per call, no cross-provider
 * fallback or retry (#367's job), no persistence, no canonical matching
 * decision beyond the same `lookupMapping`-supplied lookup the search
 * adapter already uses (a nearby result is a real POI hit, same as search —
 * unlike suggest's input tips, which can carry no backing POI at all).
 * Reuses provider-search-adapter.ts's `boundedJson` response-size guard and
 * `tencentSig` signing function rather than duplicating security-relevant
 * transport code.
 *
 * Category is a closed 5-value enum (restroom/convenience_store/dining/
 * pharmacy/atm) matching the acceptance bullet's named list exactly — no
 * free-text category, and no attempt to browse any other amenity type
 * ("特殊服务未知不推断": an unlisted special-service category is never
 * inferred or approximated by picking the "closest" known category). Each
 * category maps to a plain Chinese keyword rather than a provider-specific
 * POI type code: AMap/Tencent's numeric category-code taxonomies are not
 * verified against this environment's actual account access (no real
 * account call has been made against this endpoint — see below), so a
 * fabricated or misremembered code could silently under/over-match; a
 * keyword is the same mechanism the search adapter already uses and carries
 * no such risk.
 *
 * The location this module queries is intentionally opaque about accepting
 * anything but the providers' own documented default coordinate system
 * (GCJ02) — this module never converts a caller-supplied WGS84 point itself;
 * combining sources still requires coordinate-conversion.ts's explicit,
 * non-double-applying conversion before calling in here.
 *
 * Provider request/response shapes (`/v3/place/around`, `/ws/place/v1/search`
 * with a `nearby(...)` boundary) are taken from AMap POI 2.0 and Tencent
 * WebService Search API's public documentation (see
 * docs/agents/maps-integration-development.md's source list); no real
 * account call against these specific endpoints has been made in this
 * environment — that live verification is UNRUN, tracked the same way
 * #362/#363's prior adapters already distinguish documented-shape from
 * observed-response evidence.
 */

import type { PlaceSearchCandidate, Provider } from "./place-identity.ts";
import { boundedJson, limits as sharedLimits, tencentSig } from "./provider-search-adapter.ts";

export type NearbyCategory = "restroom" | "convenience_store" | "dining" | "pharmacy" | "atm";

/**
 * Plain Chinese keyword per category — see module doc for why a keyword is
 * used instead of a provider-specific POI type code. Closed set, no other
 * category is accepted (enforced by the TypeScript union, not a runtime
 * fallback/default).
 */
const CATEGORY_KEYWORD: Readonly<Record<NearbyCategory, string>> = Object.freeze({
  restroom: "公共厕所",
  convenience_store: "便利店",
  dining: "餐饮",
  pharmacy: "药店",
  atm: "ATM",
});

export const limits = Object.freeze({
  ...sharedLimits,
  /** Arbitrary conservative bound on the search radius this module will request, not a provider-documented limit. */
  radiusMetersMax: 5000,
  radiusMetersDefault: 1000,
});

export type NearbyCandidate = Readonly<PlaceSearchCandidate & {
  /** Meters from the query location, as reported by the provider; null when the provider response omits it — never estimated. */
  distanceMeters: number | null;
}>;

export type NearbyOutcome =
  | Readonly<{ status: "observed"; candidates: readonly NearbyCandidate[] }>
  | Readonly<{ status: "no_results" }>
  | Readonly<{ status: "provider_rejected"; code: string | null }>
  | Readonly<{ status: "invalid_response" }>
  | Readonly<{ status: "http_error"; httpStatus: number }>
  | Readonly<{ status: "timeout" }>
  | Readonly<{ status: "transport_or_response_error" }>
  | Readonly<{ status: "UNRUN"; reason: "disabled" | "missing_secure_credential" }>;

const config: Record<Provider, Readonly<{ envKey: string; envFlag: string; host: string; envSk?: string }>> = {
  amap: { envKey: "AMAP_WEB_SERVICE_KEY", envFlag: "AMAP_NEARBY_ENABLED", host: "restapi.amap.com" },
  tencent: { envKey: "TENCENT_MAP_WEB_SERVICE_KEY", envFlag: "TENCENT_MAP_NEARBY_ENABLED", host: "apis.map.qq.com", envSk: "TENCENT_MAP_SK" },
};

/** Clamps a caller-supplied radius into this module's declared bound; never errors on an out-of-range request. */
function boundedRadius(radiusMeters: number | undefined): number {
  if (typeof radiusMeters !== "number" || !Number.isFinite(radiusMeters) || radiusMeters <= 0) {
    return limits.radiusMetersDefault;
  }
  return Math.min(radiusMeters, limits.radiusMetersMax);
}

function buildRequest(
  provider: Provider,
  key: string,
  sk: string | undefined,
  category: NearbyCategory,
  location: Readonly<{ lat: number; lng: number }>,
  radiusMeters: number,
): { url: URL } {
  const host = config[provider].host;
  const keyword = CATEGORY_KEYWORD[category];
  const [path, params]: [string, Record<string, string>] = provider === "amap"
    ? ["/v3/place/around", { location: `${location.lng},${location.lat}`, keywords: keyword, radius: String(radiusMeters), offset: String(limits.maxCandidates), page: "1" }]
    : ["/ws/place/v1/search", { keyword, boundary: `nearby(${location.lat},${location.lng},${radiusMeters})`, page_size: String(limits.maxCandidates), page_index: "1" }];
  const allParams: Record<string, string> = { ...params, key, output: "json" };
  if (provider === "tencent" && sk) allParams.sig = tencentSig(path, allParams, sk);
  const url = new URL(`https://${host}${path}`);
  url.search = new URLSearchParams(allParams).toString();
  return { url };
}

/**
 * AMap's `distance` is a numeric string in meters; Tencent's is a
 * `_distance` number in meters (present only when the provider computed
 * one). Both parsed defensively — a missing or malformed value is `null`,
 * never estimated from the query radius or dropped candidate order.
 */
function parseDistance(provider: Provider, row: Record<string, unknown>): number | null {
  const raw = provider === "amap" ? row.distance : row._distance;
  if (typeof raw === "string") {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 0 ? raw : null;
  }
  return null;
}

function normalizeCandidates(
  provider: Provider,
  body: Record<string, unknown>,
  lookupMapping: (provider: Provider, providerPoiId: string) => string | null,
): { status: "observed" | "no_results" | "invalid_response"; candidates?: readonly NearbyCandidate[] } {
  const rows = provider === "amap" ? body.pois : body.data;
  if (!Array.isArray(rows)) return { status: "invalid_response" };
  if (rows.length === 0) return { status: "no_results" };
  const candidates: NearbyCandidate[] = [];
  for (const row of rows.slice(0, limits.maxCandidates)) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const providerPoiId = typeof r.id === "string" ? r.id : null;
    const rawName = typeof (r.name ?? r.title) === "string" ? String(r.name ?? r.title) : null;
    if (!providerPoiId || !rawName) continue;
    candidates.push(Object.freeze({
      provider,
      providerPoiId,
      rawName,
      matchedCanonicalPoiId: lookupMapping(provider, providerPoiId),
      distanceMeters: parseDistance(provider, r),
    }));
  }
  return candidates.length > 0 ? { status: "observed", candidates: Object.freeze(candidates) } : { status: "invalid_response" };
}

export async function nearbySearch(input: {
  provider: Provider;
  category: NearbyCategory;
  /** Must already be in the providers' documented default coordinate system (GCJ02) — see module doc. */
  location: Readonly<{ lat: number; lng: number }>;
  /** Meters; clamped into `limits.radiusMetersMax` and defaulted to `limits.radiusMetersDefault` when omitted or invalid, never rejected. */
  radiusMeters?: number;
  env: Readonly<Record<string, string | undefined>>;
  lookupMapping: (provider: Provider, providerPoiId: string) => string | null;
  fetcher?: typeof fetch;
}): Promise<NearbyOutcome> {
  const { provider, category, location, radiusMeters, env, lookupMapping, fetcher = fetch } = input;
  const c = config[provider];
  if (env[c.envFlag] !== "true") return { status: "UNRUN", reason: "disabled" };
  const key = env[c.envKey];
  if (typeof key !== "string" || !key.trim()) return { status: "UNRUN", reason: "missing_secure_credential" };
  const sk = c.envSk ? env[c.envSk] : undefined;
  const { url } = buildRequest(provider, key, sk, category, location, boundedRadius(radiusMeters));
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
