import { compareRoutes, type RouteOption } from "../route-comparison.ts";
import { boundedJson } from "../provider-search-adapter.ts";
import { record, POLICY } from "./contract.ts";

export type TrafficCondition = { status: "observed" | "uncovered"; meters: Record<"unknown" | "clear" | "slow" | "congested" | "severe", number> | null };
const categories = { "未知": "unknown", "畅通": "clear", "缓行": "slow", "拥堵": "congested", "严重拥堵": "severe" } as const;
/** Aggregate documented v5 fields only; never retain tmc_polyline or infer an incident. */
export function readTrafficCondition(body: unknown): TrafficCondition {
  const unavailable: TrafficCondition = { status: "uncovered", meters: null };
  if (!record(body) || body.status !== "1" || body.infocode !== "10000" || !record(body.route)
    || !Array.isArray(body.route.paths) || !record(body.route.paths[0])) return unavailable;
  const path = body.route.paths[0];
  if (!Array.isArray(path.steps) || !path.steps.length || path.steps.length > 300) return unavailable;
  const meters: NonNullable<TrafficCondition["meters"]> = { unknown: 0, clear: 0, slow: 0, congested: 0, severe: 0 };
  let count = 0, total = 0;
  for (const step of path.steps) {
    if (!record(step) || !Array.isArray(step.tmcs) || !step.tmcs.length) return unavailable;
    for (const tmc of step.tmcs) {
      if (++count > 1000 || !record(tmc) || typeof tmc.tmc_status !== "string" || !Object.hasOwn(categories, tmc.tmc_status)
        || !(typeof tmc.tmc_distance === "number" || typeof tmc.tmc_distance === "string" && /^\d+(\.\d+)?$/.test(tmc.tmc_distance))) return unavailable;
      const distance = Number(tmc.tmc_distance);
      if (!Number.isFinite(distance) || distance <= 0 || distance > 100000000) return unavailable;
      total += distance; meters[categories[tmc.tmc_status as keyof typeof categories]] += distance;
    }
  }
  const routeDistance = Number(path.distance);
  // Partial/unknown coverage does not assert a condition over the whole route.
  if (!Number.isFinite(routeDistance) || Math.abs(total - routeDistance) > Math.max(10, routeDistance * 0.01) || meters.unknown > 0) return unavailable;
  return { status: "observed", meters };
}

export type ForegroundProviderResult = {
  fetchedAt: string; expiresAt: string; options: RouteOption[]; condition: TrafficCondition;
  destination: { provider: "amap"; providerPoiId: string; rawName: string; address: string | null; webUrl: string | null };
  providerCalls: number;
};
/** Actual production adapter reuses #364's endpoint/plan validation and whole-route parsing. */
export async function observeForegroundRoute(endpoints: { originId: string; destinationId: string }, deps: {
  env: Readonly<Record<string, string | undefined>>; signal: AbortSignal; fetcher: typeof fetch;
  beforeRequest: () => Promise<boolean>;
}): Promise<ForegroundProviderResult | null> {
  let calls = 0, failed = false, condition: TrafficCondition = { status: "uncovered", meters: null };
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (failed || deps.signal.aborted || calls >= POLICY.calls || url.protocol !== "https:" || url.hostname !== "restapi.amap.com"
      || !["/v3/place/detail", "/v5/direction/walking", "/v5/direction/driving", "/v5/direction/transit/integrated"].includes(url.pathname)
      || !await deps.beforeRequest()) { failed = true; throw new Error("Foreground authorization unavailable"); }
    if (failed || deps.signal.aborted) throw new Error("Foreground stopped");
    if (url.pathname === "/v5/direction/driving") url.searchParams.set("show_fields", "cost,tmcs");
    calls++;
    let response: Response;
    try { response = await deps.fetcher(url, { ...init, redirect: "error", signal: AbortSignal.any([deps.signal, ...(init?.signal ? [init.signal] : [])]) }); } catch (error) { failed = true; throw error; }
    if (!response.ok) { failed = true; throw new Error("Provider outcome unavailable"); }
    if (url.pathname === "/v5/direction/driving") {
      const body = await boundedJson(response);
      condition = readTrafficCondition(body);
      return Response.json(body);
    }
    return response;
  };
  const result = await compareRoutes(new URLSearchParams({ provider: "amap", ...endpoints, departure: "now" }), { env: deps.env, fetcher });
  const body: unknown = result.body;
  if (failed || deps.signal.aborted || result.status !== 200 || !record(body) || !Array.isArray(body.options)
    || !record(body.destination) || typeof body.destination.providerPoiId !== "string"
    || typeof body.destination.rawName !== "string" || typeof body.expiresAt !== "string"
    || Date.parse(body.expiresAt) <= Date.now()) return null;
  const options = body.options as RouteOption[];
  if (!options.some(o => o.mode === "driving" && o.status === "observed")) condition = { status: "uncovered", meters: null };
  return { fetchedAt: new Date().toISOString(), expiresAt: body.expiresAt, options, condition,
    destination: { provider: "amap", providerPoiId: body.destination.providerPoiId, rawName: body.destination.rawName,
      address: typeof body.destination.address === "string" ? body.destination.address : null,
      webUrl: options.find(o => o.status === "observed")?.webUrl ?? null }, providerCalls: calls };
}
