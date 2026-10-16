import { createHash } from "node:crypto";
import { assertTripSnapshot, type TripDay } from "../patch/contract.ts";

export const INVENTORY_CAP = 8;
export const INVENTORY_BYTES = 262144;
export const INVENTORY_COVERAGE = "owner-visible-canonical-trips" as const;
export type InventoryHeader = Readonly<{ id: string; headVersion: number; title: string; updatedAt: string }>;
export type InventoryTrip = InventoryHeader & Readonly<{ content: Readonly<{ days: readonly TripDay[] }>; confirmationState: "initial" | "confirmed" | "unknown" }>;
export type TripInventory = Readonly<{ schemaVersion: "native-trip-inventory/1"; ownerId: string; coverage: typeof INVENTORY_COVERAGE; complete: true; trips: readonly InventoryTrip[]; count: number; digest: string }>;
export const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
export function keys(v: unknown, required: readonly string[], optional: readonly string[] = []): v is Record<string, unknown> {
  return record(v) && Object.keys(v).length >= required.length && required.every(k => Object.hasOwn(v, k))
    && Reflect.ownKeys(v).every(k => typeof k === "string" && [...required, ...optional].includes(k)
      && Object.getOwnPropertyDescriptor(v, k)?.enumerable === true && Object.hasOwn(Object.getOwnPropertyDescriptor(v, k)!, "value"));
}
export function validHeader(v: unknown): v is InventoryHeader {
  return keys(v, ["id", "headVersion", "title", "updatedAt"]) && uuid(v.id)
    && Number.isSafeInteger(v.headVersion) && Number(v.headVersion) >= 0 && typeof v.title === "string" && v.title.trim().length > 0 && v.title.length <= 160
    && typeof v.updatedAt === "string" && v.updatedAt.length <= 40 && Number.isFinite(Date.parse(v.updatedAt));
}
/** Closed canonical projection: never carry audits, historical versions or new/raw fields. */
export function validTrip(v: unknown): v is InventoryTrip {
  if (!keys(v, ["id", "headVersion", "title", "updatedAt", "content", "confirmationState"])) return false;
  const { id, headVersion, title, updatedAt } = v;
  if (!validHeader({ id, headVersion, title, updatedAt }) || !["initial", "confirmed", "unknown"].includes(String(v.confirmationState))
    || (headVersion === 0 && v.confirmationState !== "initial") || (headVersion !== 0 && v.confirmationState === "initial")
    || !keys(v.content, ["days"]) || !Array.isArray(v.content.days)) return false;
  try {
    for (const day of v.content.days) {
      if (!keys(day, ["id", "date", "items"], ["timeZone"]) || !Array.isArray(day.items)) return false;
      for (const item of day.items) if (!keys(item, ["id", "dayId", "title"], ["startsAt", "endsAt", "manualOrder", "chineseAddress"])) return false;
    }
    assertTripSnapshot({ version: headVersion, title, days: v.content.days }); return true;
  } catch { return false; }
}
/** Sorted object keys, array order retained; JSON roundtrip first rejects non-JSON values. */
export function stableJSON(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (Reflect.ownKeys(value).length !== value.length + 1) throw Error("Non-JSON array");
    return "[" + value.map(v => stableJSON(v)).join(",") + "]";
  }
  if (!record(value) || Object.getPrototypeOf(value) !== Object.prototype) throw Error("Non-JSON value");
  return "{" + Reflect.ownKeys(value).map(k => {
    if (typeof k !== "string" || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, k)!, "value")) throw Error("Non-JSON property");
    return k;
  }).sort().map(k => JSON.stringify(k) + ":" + stableJSON(value[k])).join(",") + "}";
}
export const inventoryDigest = (ownerId: string, trips: readonly InventoryTrip[]) => createHash("sha256")
  .update(stableJSON({ schemaVersion: "native-trip-inventory/1", coverage: INVENTORY_COVERAGE, ownerId, count: trips.length, trips })).digest("hex");
export function parseInventory(v: unknown): TripInventory | null {
  try {
    if (!keys(v, ["schemaVersion", "ownerId", "coverage", "complete", "trips", "count", "digest"])
      || v.schemaVersion !== "native-trip-inventory/1" || !uuid(v.ownerId) || v.coverage !== INVENTORY_COVERAGE || v.complete !== true
      || !Array.isArray(v.trips) || v.trips.length > INVENTORY_CAP || v.count !== v.trips.length || !v.trips.every(validTrip)
      || v.trips.some((t, i, trips) => i > 0 && trips[i - 1].id >= t.id) || typeof v.digest !== "string"
      || v.digest !== inventoryDigest(v.ownerId, v.trips) || Buffer.byteLength(stableJSON(v)) > INVENTORY_BYTES) return null;
    return JSON.parse(stableJSON(v)) as TripInventory;
  } catch { return null; }
}
