/**
 * Runtime place-detail transport for #363's "统一服务端适配搜索/详情/地址"
 * bullet — the "detail" half of that closed adapter set (search already
 * lives in provider-search-adapter.ts; geocode/route/matrix/nav-handoff are
 * separate future slices, not this one). Deliberately narrow, same shape as
 * provider-search-adapter.ts: one provider per call, no cross-provider
 * fallback or retry (#367's job), no persistence, no canonical matching
 * decision. Reuses that module's `boundedJson` guard and `tencentSig`
 * signing function instead of duplicating security-relevant transport code.
 *
 * The location this module returns is intentionally opaque about its
 * coordinate system beyond the provider's own documented default (GCJ02 for
 * both AMap and Tencent web-service responses unless a different
 * `coord_type`/`output` parameter is requested, which this module never
 * does) — combining it with a WGS84 source still requires
 * coordinate-conversion.ts's explicit, non-double-applying conversion.
 */

import type { CoordinateSystem, Provider } from "./place-identity.ts";
import { isValidSystemedCoordinate } from "./coordinate-conversion.ts";
import { boundedJson, limits, tencentSig } from "./provider-search-adapter.ts";

export type PlaceDetail = Readonly<{
  provider: Provider;
  providerPoiId: string;
  rawName: string;
  cityCode?: string | null;
  /** Chinese address as returned by the provider; null when the provider omits it. */
  address: string | null;
  /** null when the provider response omits a parseable coordinate — never a fabricated 0,0 or building-centroid guess. */
  location: Readonly<{ lat: number; lng: number; coordinateSystem: CoordinateSystem }> | null;
}>;

export type DetailOutcome =
  | Readonly<{ status: "observed"; detail: PlaceDetail }>
  | Readonly<{ status: "not_found" }>
  | Readonly<{ status: "provider_rejected"; code: string | null }>
  | Readonly<{ status: "invalid_response" }>
  | Readonly<{ status: "http_error"; httpStatus: number }>
  | Readonly<{ status: "timeout" }>
  | Readonly<{ status: "transport_or_response_error" }>
  | Readonly<{ status: "UNRUN"; reason: "disabled" | "missing_secure_credential" }>;

/**
 * Both AMap and Tencent web-service place-detail responses default to
 * GCJ02 — neither provider is asked for a different `coord_type`/`output`
 * coordinate system here, so this constant documents the observed default
 * rather than inferring it per response.
 */
const DEFAULT_LOCATION_SYSTEM: CoordinateSystem = "gcj02";

const config: Record<Provider, Readonly<{ envKey: string; envFlag: string; host: string; envSk?: string }>> = {
  amap: { envKey: "AMAP_WEB_SERVICE_KEY", envFlag: "AMAP_DETAIL_ENABLED", host: "restapi.amap.com" },
  tencent: { envKey: "TENCENT_MAP_WEB_SERVICE_KEY", envFlag: "TENCENT_MAP_DETAIL_ENABLED", host: "apis.map.qq.com", envSk: "TENCENT_MAP_SK" },
};

function buildRequest(provider: Provider, key: string, sk: string | undefined, providerPoiId: string): { url: URL } {
  const host = config[provider].host;
  const [path, params]: [string, Record<string, string>] = provider === "amap"
    ? ["/v3/place/detail", { id: providerPoiId }]
    : ["/ws/place/v1/detail", { id: providerPoiId }];
  const allParams: Record<string, string> = { ...params, key, output: "json" };
  if (provider === "tencent" && sk) allParams.sig = tencentSig(path, allParams, sk);
  const url = new URL(`https://${host}${path}`);
  url.search = new URLSearchParams(allParams).toString();
  return { url };
}

/**
 * AMap's `location` is a `"lng,lat"` string; Tencent's is a `{lat,lng}`
 * object. Both parsed defensively — no throw on malformed input; instead
 * the shared `isValidSystemedCoordinate` runtime check (coordinate-
 * conversion.ts) rejects a NaN/Infinity, swapped, or out-of-range lat/lng
 * (not just non-finite) rather than only trusting `Number.isFinite`.
 */
function parseLocation(provider: Provider, raw: unknown): PlaceDetail["location"] {
  let lat: number, lng: number;
  if (provider === "amap") {
    if (typeof raw !== "string") return null;
    const parts = raw.split(",");
    if (parts.length !== 2) return null;
    lng = Number(parts[0]);
    lat = Number(parts[1]);
  } else {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.lat !== "number" || typeof r.lng !== "number") return null;
    lat = r.lat;
    lng = r.lng;
  }
  const candidate = { lat, lng, system: DEFAULT_LOCATION_SYSTEM };
  if (!isValidSystemedCoordinate(candidate)) return null;
  return Object.freeze({ lat, lng, coordinateSystem: DEFAULT_LOCATION_SYSTEM });
}

function normalizeDetail(provider: Provider, providerPoiId: string, row: Record<string, unknown>): PlaceDetail | null {
  if (row.id !== providerPoiId) return null;
  const rawName = typeof (row.name ?? row.title) === "string" ? String(row.name ?? row.title) : null;
  if (!rawName) return null;
  const address = typeof row.address === "string" && row.address.length > 0 ? row.address : null;
  const location = parseLocation(provider, row.location);
  return Object.freeze({ provider, providerPoiId, rawName, address, location, ...(provider === "amap" ? { cityCode: typeof row.citycode === "string" && /^\d{2,4}$/.test(row.citycode) ? row.citycode : null } : {}) });
}

export async function getPlaceDetail(input: {
  provider: Provider;
  providerPoiId: string;
  env: Readonly<Record<string, string | undefined>>;
  fetcher?: typeof fetch;
}): Promise<DetailOutcome> {
  const { provider, providerPoiId, env, fetcher = fetch } = input;
  const c = config[provider];
  if (env[c.envFlag] !== "true") return { status: "UNRUN", reason: "disabled" };
  const key = env[c.envKey];
  if (typeof key !== "string" || !key.trim()) return { status: "UNRUN", reason: "missing_secure_credential" };
  const sk = c.envSk ? env[c.envSk] : undefined;
  const { url } = buildRequest(provider, key, sk, providerPoiId);
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
  const row = provider === "amap"
    ? (Array.isArray(b.pois) ? b.pois[0] : undefined)
    : b.result;
  if (!row || typeof row !== "object" || Array.isArray(row)) return { status: "not_found" };
  const detail = normalizeDetail(provider, providerPoiId, row as Record<string, unknown>);
  return detail ? { status: "observed", detail } : { status: "invalid_response" };
}
