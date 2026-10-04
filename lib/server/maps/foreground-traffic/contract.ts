import type { RouteMode } from "../route-comparison.ts";

export const POLICY = { ttlMs: 300_000, throttleMs: 60_000, refreshMs: 120_000, movementMeters: 250, comparisons: 3, calls: 5, activeScopes: 128 } as const;
export const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const item = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
export type TrafficInput = {
  operation: "check" | "refresh" | "stop"; expectedHeadVersion: number; dayId: string; itemId: string;
  originPlaceReferenceId: string; destinationPlaceReferenceId: string; mode: RouteMode; departure: "now";
  mapConsent: boolean; foreground: boolean; previousReceiptId: string | null; movementMeters: number; expectedStopEpoch: number | null;
};
export function parseTrafficInput(v: unknown): TrafficInput | null {
  const keys = ["operation", "expectedHeadVersion", "dayId", "itemId", "originPlaceReferenceId", "destinationPlaceReferenceId", "mode", "departure", "mapConsent", "foreground", "previousReceiptId", "movementMeters", "expectedStopEpoch"];
  if (!record(v) || Object.keys(v).length !== keys.length || !keys.every(k => Object.hasOwn(v, k))
    || !["check", "refresh", "stop"].includes(v.operation as string) || typeof v.expectedHeadVersion !== "number"
    || !Number.isSafeInteger(v.expectedHeadVersion) || v.expectedHeadVersion < 0 || v.expectedHeadVersion > 999999999
    || !item(v.dayId) || !item(v.itemId) || !uuid(v.originPlaceReferenceId) || !uuid(v.destinationPlaceReferenceId)
    || v.originPlaceReferenceId === v.destinationPlaceReferenceId || !["walking", "transit", "driving"].includes(v.mode as string)
    || v.departure !== "now" || typeof v.mapConsent !== "boolean" || typeof v.foreground !== "boolean"
    || (v.previousReceiptId !== null && !uuid(v.previousReceiptId)) || typeof v.movementMeters !== "number"
    || (v.expectedStopEpoch !== null && (typeof v.expectedStopEpoch !== "number" || !Number.isSafeInteger(v.expectedStopEpoch) || v.expectedStopEpoch < 0))
    || !Number.isFinite(v.movementMeters) || v.movementMeters < 0 || v.movementMeters > 100000) return null;
  return structuredClone(v) as TrafficInput;
}
export type TrafficBinding = {
  actor: string; session: string; tripId: string; headVersion: number; dayId: string; itemId: string;
  originPlaceReferenceId: string; destinationPlaceReferenceId: string; mode: RouteMode; departure: "now";
};
export const scopeKey = (b: TrafficBinding) => JSON.stringify(b);
export const enabled = (env: Readonly<Record<string, string | undefined>>) => env.VISEPANDA_FOREGROUND_TRAFFIC_ENABLED === "true"
  && env.AMAP_ROUTES_ENABLED === "true" && env.AMAP_DETAIL_ENABLED === "true" && !!env.AMAP_WEB_SERVICE_KEY?.trim();
