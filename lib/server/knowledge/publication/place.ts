import type { GroundedAddressClaim, GroundedTimeWindowClaim } from "../../contracts/index.ts";

/** Editorial identity and values, not model output or a publication grant. */
export type PlaceIdentity = Readonly<{ names: Readonly<{ en: string; zh: string }> }>;
export type PlaceValue = GroundedAddressClaim["value"] | GroundedTimeWindowClaim["value"];

const record = (v: unknown, keys: string[]): v is Record<string, unknown> => !!v && typeof v === "object"
  && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.trim() === v
  && v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/u.test(v);
const instant = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v.replace("Z", ".000Z");

/** No fuzzy matching, model-generated aliases, or cross-city fallback. */
export function normalizedPlaceName(value: string): string { return value.replace(/^ +| +$/g, "").replace(/ +/g, " ").replace(/[A-Z]/g, c => c.toLowerCase()); }

export function validPlaceFields(place: unknown, value: unknown, predicate: unknown, objectId: unknown): boolean {
  if (!record(place, ["names"]) || !record(place.names, ["en", "zh"])
    || !text(place.names.en, 160) || !text(place.names.zh, 160)) return false;
  if (predicate === "located_at" && objectId === "place_address") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const address = value as Record<string, unknown>;
    if (!record(address, Object.hasOwn(address, "locality") ? ["lines", "locality", "countryCode"] : ["lines", "countryCode"])) return false;
    return Array.isArray(address.lines) && address.lines.length >= 1 && address.lines.length <= 3
      && address.lines.every(line => text(line, 160)) && address.countryCode === "CN"
      && (!Object.hasOwn(address, "locality") || text(address.locality, 120));
  }
  // A single explicitly dated window. Weekly schedules and inferred exceptions
  // are not encoded as today's hours; the resolver must check its local date.
  return predicate === "opens_during" && objectId === "opening_hours"
    && record(value, ["startsAt", "endsAt", "timeZone"]) && instant(value.startsAt) && instant(value.endsAt)
    && value.timeZone === "Asia/Shanghai" && Date.parse(value.endsAt) > Date.parse(value.startsAt)
    && Date.parse(value.endsAt) - Date.parse(value.startsAt) <= 86400000;
}
