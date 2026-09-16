/**
 * Runtime forward-geocode transport for #363's "统一服务端适配搜索/详情/
 * 地址解析" bullet — the "地址解析" (address resolution) half of that closed
 * adapter set. Search (`provider-search-adapter.ts`) and detail
 * (`provider-detail-adapter.ts`) already exist; suggest/nearby-category and
 * reverse-geocode remain separate future slices, not this one.
 *
 * Same shape as its siblings: one provider per call, no cross-provider
 * fallback or retry (#367's job), no persistence, no canonical matching
 * decision. Reuses provider-search-adapter.ts's `boundedJson` response-size
 * guard and `tencentSig` signing function rather than duplicating
 * security-relevant transport code.
 *
 * The location this module returns is intentionally opaque about its
 * coordinate system beyond the provider's own documented default (GCJ02 for
 * both AMap and Tencent web-service responses unless a different
 * `coord_type`/`output` parameter is requested, which this module never
 * does) — combining it with a WGS84 source still requires
 * coordinate-conversion.ts's explicit, non-double-applying conversion.
 *
 * Provider request/response shapes (`/v3/geocode/geo`, `/ws/geocoder/v1/`)
 * are taken from AMap Geocoding API and Tencent WebService Geocoder's public
 * documentation (see docs/agents/maps-integration-development.md's source
 * list); no real account call against these specific endpoints has been
 * made in this environment — that live verification is UNRUN, tracked the
 * same way #362/#363's prior adapters already distinguish documented-shape
 * from observed-response evidence.
 */

import type { CoordinateSystem, Provider } from "./place-identity.ts";
import { boundedJson, limits, tencentSig } from "./provider-search-adapter.ts";

export type GeocodeResult = Readonly<{
  provider: Provider;
  /** Chinese address as echoed/normalized by the provider — never translated or inferred. */
  formattedAddress: string;
  /** null when the provider response omits a parseable coordinate — never a fabricated 0,0 guess. */
  location: Readonly<{ lat: number; lng: number; coordinateSystem: CoordinateSystem }> | null;
}>;

export type GeocodeOutcome =
  | Readonly<{ status: "observed"; result: GeocodeResult }>
  | Readonly<{ status: "not_found" }>
  | Readonly<{ status: "provider_rejected"; code: string | null }>
  | Readonly<{ status: "invalid_response" }>
  | Readonly<{ status: "http_error"; httpStatus: number }>
  | Readonly<{ status: "timeout" }>
  | Readonly<{ status: "transport_or_response_error" }>
  | Readonly<{ status: "UNRUN"; reason: "disabled" | "missing_secure_credential" }>;

/**
 * Both AMap and Tencent web-service geocoder responses default to GCJ02 —
 * neither provider is asked for a different `coord_type`/`output` coordinate
 * system here, so this constant documents the observed default rather than
 * inferring it per response.
 */
const DEFAULT_LOCATION_SYSTEM: CoordinateSystem = "gcj02";

const config: Record<Provider, Readonly<{ envKey: string; envFlag: string; host: string; envSk?: string }>> = {
  amap: { envKey: "AMAP_WEB_SERVICE_KEY", envFlag: "AMAP_GEOCODE_ENABLED", host: "restapi.amap.com" },
  tencent: { envKey: "TENCENT_MAP_WEB_SERVICE_KEY", envFlag: "TENCENT_MAP_GEOCODE_ENABLED", host: "apis.map.qq.com", envSk: "TENCENT_MAP_SK" },
};

function buildRequest(provider: Provider, key: string, sk: string | undefined, address: string, city: string | undefined): { url: URL } {
  const host = config[provider].host;
  const baseParams: Record<string, string> = { address };
  if (city) baseParams.city = city;
  const [path, params]: [string, Record<string, string>] = provider === "amap"
    ? ["/v3/geocode/geo", baseParams]
    : ["/ws/geocoder/v1/", baseParams];
  const allParams: Record<string, string> = { ...params, key, output: "json" };
  if (provider === "tencent" && sk) allParams.sig = tencentSig(path, allParams, sk);
  const url = new URL(`https://${host}${path}`);
  url.search = new URLSearchParams(allParams).toString();
  return { url };
}

/** AMap's `location` is a `"lng,lat"` string; Tencent's is a `{lat,lng}` object. Both parsed defensively — no throw on malformed input. */
function parseLocation(provider: Provider, raw: unknown): GeocodeResult["location"] {
  if (provider === "amap") {
    if (typeof raw !== "string") return null;
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

function normalizeResult(provider: Provider, row: Record<string, unknown>): GeocodeResult | null {
  const formattedAddress = typeof row.formatted_address === "string" && row.formatted_address.length > 0
    ? row.formatted_address
    : typeof row.address === "string" && row.address.length > 0
      ? row.address
      : null;
  if (!formattedAddress) return null;
  const location = parseLocation(provider, row.location);
  return Object.freeze({ provider, formattedAddress, location });
}

export async function geocodeAddress(input: {
  provider: Provider;
  address: string;
  /** Optional disambiguation hint (AMap's `city` param); never required by this module. */
  city?: string;
  env: Readonly<Record<string, string | undefined>>;
  fetcher?: typeof fetch;
}): Promise<GeocodeOutcome> {
  const { provider, address, city, env, fetcher = fetch } = input;
  const c = config[provider];
  if (env[c.envFlag] !== "true") return { status: "UNRUN", reason: "disabled" };
  const key = env[c.envKey];
  if (typeof key !== "string" || !key.trim()) return { status: "UNRUN", reason: "missing_secure_credential" };
  const sk = c.envSk ? env[c.envSk] : undefined;
  const { url } = buildRequest(provider, key, sk, address, city);
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
  if (provider === "amap") {
    const geocodes = b.geocodes;
    if (!Array.isArray(geocodes)) return { status: "invalid_response" };
    if (geocodes.length === 0) return { status: "not_found" };
    const first = geocodes[0];
    if (!first || typeof first !== "object" || Array.isArray(first)) return { status: "invalid_response" };
    const result = normalizeResult(provider, first as Record<string, unknown>);
    return result ? { status: "observed", result } : { status: "invalid_response" };
  }
  const result = b.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) return { status: "not_found" };
  const normalized = normalizeResult(provider, result as Record<string, unknown>);
  return normalized ? { status: "observed", result: normalized } : { status: "invalid_response" };
}
