import type { Provider } from "./place-identity.ts";
import { isValidSystemedCoordinate, type SystemedCoordinate } from "./coordinate-conversion.ts";
import { boundedJson, limits } from "./provider-search-adapter.ts";

export type ReverseGeocodeResult = Readonly<{ provider: "amap"; formattedAddress: string }>;
export type ReverseGeocodeOutcome =
  | Readonly<{ status: "observed"; result: ReverseGeocodeResult }>
  | Readonly<{ status: "not_found" | "invalid_response" | "timeout" | "transport_or_response_error" }>
  | Readonly<{ status: "provider_rejected"; code: string | null }>
  | Readonly<{ status: "http_error"; httpStatus: number }>
  | Readonly<{ status: "UNRUN"; reason: "disabled" | "missing_secure_credential" | "provider_not_implemented" }>;

/**
 * Reverse address lookup is an observation, never a canonical identity,
 * entrance claim, reviewed Fact, or substitute for a provider POI detail.
 * AMap Web Service accepts its documented GCJ02 longitude,latitude form.
 */
export async function reverseGeocode(input: {
  provider: Provider;
  location: SystemedCoordinate;
  env: Readonly<Record<string, string | undefined>>;
  fetcher?: typeof fetch;
}): Promise<ReverseGeocodeOutcome> {
  const { provider, location, env, fetcher = fetch } = input;
  if (!isValidSystemedCoordinate(location) || location.system !== "gcj02") return { status: "invalid_response" };
  if (provider !== "amap") return { status: "UNRUN", reason: "provider_not_implemented" };
  if (env.AMAP_REVERSE_GEOCODE_ENABLED !== "true") return { status: "UNRUN", reason: "disabled" };
  const key = env.AMAP_WEB_SERVICE_KEY;
  if (typeof key !== "string" || !key.trim()) return { status: "UNRUN", reason: "missing_secure_credential" };
  const url = new URL("https://restapi.amap.com/v3/geocode/regeo");
  url.search = new URLSearchParams({ key, output: "json", location: `${location.lng},${location.lat}`, extensions: "base" }).toString();
  let response: Response;
  try { response = await fetcher(url, { method: "GET", redirect: "error", signal: AbortSignal.timeout(limits.timeoutMs) }); }
  catch (error) { return { status: (error as Error)?.name === "TimeoutError" ? "timeout" : "transport_or_response_error" }; }
  if (!response.ok) return { status: "http_error", httpStatus: response.status };
  let body: unknown;
  try { body = await boundedJson(response); } catch { return { status: "transport_or_response_error" }; }
  if (!body || typeof body !== "object" || Array.isArray(body)) return { status: "invalid_response" };
  const value = body as Record<string, unknown>;
  if (value.status !== "1" || value.infocode !== "10000") {
    const code = value.infocode;
    return { status: "provider_rejected", code: /^\d{1,8}$/.test(String(code)) ? String(code) : null };
  }
  const regeo = value.regeocode;
  if (!regeo || typeof regeo !== "object" || Array.isArray(regeo)) return { status: "not_found" };
  const address = (regeo as Record<string, unknown>).formatted_address;
  return typeof address === "string" && address.trim().length > 0
    ? { status: "observed", result: Object.freeze({ provider: "amap", formattedAddress: address }) }
    : { status: "not_found" };
}
