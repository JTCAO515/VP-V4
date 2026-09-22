import { getPlaceDetail, type PlaceDetail } from "./provider-detail-adapter.ts";
import { boundedJson, limits } from "./provider-search-adapter.ts";

type RecordValue = Record<string, unknown>;
const object = (v: unknown): RecordValue => v && typeof v === "object" && !Array.isArray(v) ? v as RecordValue : {};
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const number = (v: unknown): number | null => (typeof v === "number" || typeof v === "string" && v.trim() !== "") && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null;
const label = (v: unknown): string | null => typeof v === "string" && v.trim() && v.length <= 1000 ? v : null;
export type RouteMode = "walking" | "transit" | "driving";
export type RouteOption = { mode: RouteMode; status: string; durationSeconds?: number; distanceMeters?: number; walkingMeters?: number | null; transfers?: number | null; estimateCny?: number | null; estimateKind?: string; steps?: string[]; departureAt?: string; arrivalAt?: string; webUrl?: string };
const coordinate = (place: PlaceDetail) => `${place.location!.lng.toFixed(6)},${place.location!.lat.toFixed(6)}`;
function sameCoordinate(value: unknown, place: PlaceDetail) {
  if (typeof value !== "string") return false;
  const parts = value.split(",");
  return parts.length === 2 && parts.every(p => p.trim()) && Math.abs(Number(parts[0]) - place.location!.lng) < 0.00001 && Math.abs(Number(parts[1]) - place.location!.lat) < 0.00001;
}
function webUrl(origin: PlaceDetail, destination: PlaceDetail, mode: RouteMode) {
  const url = new URL("https://uri.amap.com/navigation");
  url.search = new URLSearchParams({ from: `${coordinate(origin)},${origin.rawName}`, to: `${coordinate(destination)},${destination.rawName}`, mode: mode === "walking" ? "walk" : mode === "driving" ? "car" : "bus", coordinate: "gaode", src: "VisePanda", callnative: "0" }).toString();
  return url.toString();
}
async function route(mode: RouteMode, origin: PlaceDetail, destination: PlaceDetail, key: string, fetcher: typeof fetch, observedAt: string): Promise<RouteOption> {
  if (mode === "transit" && (!origin.cityCode || !destination.cityCode)) return { mode, status: "city_unknown" };
  const url = new URL(`https://restapi.amap.com/v5/direction/${mode === "transit" ? "transit/integrated" : mode}`);
  url.search = new URLSearchParams({ key, origin: coordinate(origin), destination: coordinate(destination), show_fields: "cost", ...(mode === "transit" ? { city1: origin.cityCode!, city2: destination.cityCode!, originpoi: origin.providerPoiId, destinationpoi: destination.providerPoiId, AlternativeRoute: "1" } : { origin_id: origin.providerPoiId, destination_id: destination.providerPoiId, ...(mode === "walking" ? { alternative_route: "1" } : {}) }) }).toString();
  try {
    const response = await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(limits.timeoutMs) });
    if (!response.ok) return { mode, status: "unavailable" };
    const body = object(await boundedJson(response));
    if (body.status !== "1" || body.infocode !== "10000") return { mode, status: "provider_rejected" };
    const result = object(body.route);
    // Reject swapped/stale endpoints instead of attaching an unrelated route to selected POIs.
    if (!sameCoordinate(result.origin, origin) || !sameCoordinate(result.destination, destination)) return { mode, status: "endpoint_mismatch" };
    const alternatives = result[mode === "transit" ? "transits" : "paths"];
    if (!Array.isArray(alternatives)) return { mode, status: "invalid_response" };
    if (!alternatives.length) return { mode, status: "no_routes" };
    const path = object(alternatives[0]), cost = object(path.cost);
    const durationSeconds = number(cost.duration), distanceMeters = number(path.distance);
    if (durationSeconds === null || durationSeconds > 604800 || distanceMeters === null) return { mode, status: "invalid_response" };
    let steps: string[] = [], walkingMeters: number | null = mode === "walking" ? distanceMeters : null, transfers: number | null = null;
    if (mode === "transit") {
      const segments = list(path.segments); let rides = 0, walk = 0, knownWalk = true;
      if (!segments.length || segments.length > 100) return { mode, status: "invalid_response" };
      for (const item of segments) {
        const segment = object(item), walking = object(segment.walking), bus = object(segment.bus);
        if (Object.keys(walking).length) {
          const distance = number(walking.distance); if (distance === null) knownWalk = false; else walk += distance;
          const walkingSteps = list(walking.steps).map(step => label(object(step).instruction));
          if (walkingSteps.some(step => !step) || distance !== null && distance > 0 && !walkingSteps.length) return { mode, status: "invalid_response" };
          steps.push(...walkingSteps.filter((s): s is string => !!s));
        } else knownWalk = false;
        const lines = list(bus.buslines);
        if (lines.length) {
          // Buslines are provider alternatives for this segment; retain their names together.
          const names = lines.map(line => label(object(line).name)).filter((s): s is string => !!s);
          if (!names.length) return { mode, status: "invalid_response" };
          steps.push(names.join(" / ")); rides++;
        }
        // Do not silently drop rail/taxi portions from a supposedly complete transit plan.
        if (Object.keys(object(segment.railway)).length || Object.keys(object(segment.taxi)).length) return { mode, status: "unsupported_segment" };
      }
      walkingMeters = knownWalk ? walk : null; transfers = Math.max(0, rides - 1);
    } else {
      const instructions = list(path.steps).map(step => label(object(step).instruction));
      if (instructions.some(step => !step)) return { mode, status: "invalid_response" };
      steps = instructions.filter((s): s is string => !!s);
    }
    if (!steps.length || steps.length > 300) return { mode, status: "invalid_response" };
    return { mode, status: "observed", durationSeconds, distanceMeters, walkingMeters, transfers, estimateCny: mode === "driving" ? number(cost.tolls) : mode === "transit" ? number(cost.transit_fee) : null, estimateKind: mode === "driving" ? "tolls_only" : "transit_fare", steps, departureAt: observedAt, arrivalAt: new Date(Date.parse(observedAt) + durationSeconds * 1000).toISOString(), webUrl: webUrl(origin, destination, mode) };
  } catch (error) { return { mode, status: (error as Error)?.name === "TimeoutError" ? "timeout" : "unavailable" }; }
}

/** Explicit foreground query only. Two identity resolutions + one call per mode, no retry/cache/Trip write. */
export async function compareRoutes(params: URLSearchParams, dependencies: { env: Readonly<Record<string, string | undefined>>; fetcher?: typeof fetch }) {
  const failure = (code: string, status: number) => ({ status, body: { error: { code } } });
  const originId = params.get("originId"), destinationId = params.get("destinationId");
  if (params.get("provider") !== "amap" || !originId || !destinationId || !/^[A-Za-z0-9_-]{1,128}$/.test(originId) || !/^[A-Za-z0-9_-]{1,128}$/.test(destinationId) || originId === destinationId) return failure("INVALID_ENDPOINTS", 400);
  if (params.get("departure") !== "now") return failure("FUTURE_DEPARTURE_UNAVAILABLE", 422);
  if (dependencies.env.AMAP_ROUTES_ENABLED !== "true" || !dependencies.env.AMAP_WEB_SERVICE_KEY?.trim()) return failure("ROUTES_UNAVAILABLE", 503);
  const endpoints = await Promise.all([originId, destinationId].map(providerPoiId => getPlaceDetail({ ...dependencies, provider: "amap", providerPoiId })));
  if (endpoints.some(endpoint => endpoint.status === "timeout")) return failure("TIMEOUT_BEFORE_OUTPUT", 503);
  if (endpoints[0].status !== "observed" || endpoints[1].status !== "observed") return failure("ENDPOINTS_UNAVAILABLE", 503);
  const [origin, destination] = [endpoints[0].detail, endpoints[1].detail];
  if (!origin.location || !destination.location || origin.location.coordinateSystem !== "gcj02" || destination.location.coordinateSystem !== "gcj02" || coordinate(origin) === coordinate(destination)) return failure("INVALID_ENDPOINTS", 400);
  const observedAt = new Date().toISOString();
  const options = await Promise.all((["walking", "transit", "driving"] as const).map(mode => route(mode, origin, destination, dependencies.env.AMAP_WEB_SERVICE_KEY!, dependencies.fetcher ?? fetch, observedAt)));
  return { status: 200, body: { provider: "amap", evidenceKind: "provider_observation", departure: "now", observedAt, expiresAt: new Date(Date.parse(observedAt) + 300_000).toISOString(), origin, destination, options } };
}
