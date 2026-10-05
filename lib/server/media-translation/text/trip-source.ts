import { isUuid } from "../../identity/request-guards.ts";
import { assertTripSnapshot } from "../../trip/patch/contract.ts";
import { record, validInput } from "./contract.ts";

export type TripTranslationField = Readonly<{ dayId: string | null; itemId: string | null; field: "title" | "date"; value: string }>;
export type TripTranslationReference = Omit<TripTranslationField, "value"> & Readonly<{ ownerId: string; tripId: string; headVersion: number }>;
export type TripTranslationSource = Readonly<{ version: 1; kind: "trip_source"; ownerId: string; tripId: string; headVersion: number; title: string; fields: readonly TripTranslationField[] }>;
const opaqueId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
const uuid = (value: unknown): value is string => typeof value === "string" && isUuid(value);

/** A reference selects one actual stored field; IDs never become model context. */
export function parseTripTranslationReference(value: unknown): TripTranslationReference | null {
  if (!record(value) || Object.keys(value).length !== 6 || !["ownerId", "tripId", "headVersion", "dayId", "itemId", "field"].every(key => Object.hasOwn(value, key))
    || !uuid(value.ownerId) || !uuid(value.tripId) || !Number.isSafeInteger(value.headVersion) || Number(value.headVersion) < 1
    || !(value.dayId === null || opaqueId(value.dayId)) || !(value.itemId === null || opaqueId(value.itemId))) return null;
  if (value.field === "date" ? value.dayId === null || value.itemId !== null
    : value.field !== "title" || (value.dayId === null) !== (value.itemId === null)) return null;
  return value as TripTranslationReference;
}

/** Only confirmed canonical snapshots, never pending proposals, Memory or inferred addresses. */
export function projectTripTranslationSource(ownerId: string, value: unknown): TripTranslationSource | null {
  if (!uuid(ownerId) || !record(value) || value.confirmationState !== "confirmed" || !record(value.trip) || !record(value.content)
    || !uuid(value.trip.id) || !Number.isSafeInteger(value.trip.headVersion) || Number(value.trip.headVersion) < 1) return null;
  const snapshot = { version: value.trip.headVersion, title: value.trip.title, days: value.content.days };
  try { assertTripSnapshot(snapshot); } catch { return null; }
  const fields: TripTranslationField[] = [];
  const add = (field: TripTranslationField) => {
    if (validInput({ sourceLocale: "en", targetLocale: "zh", text: field.value })) fields.push(field);
  };
  add({ dayId: null, itemId: null, field: "title", value: snapshot.title });
  for (const day of snapshot.days) {
    add({ dayId: day.id, itemId: null, field: "date", value: day.date });
    for (const item of day.items ?? []) add({ dayId: day.id, itemId: item.id, field: "title", value: item.title });
  }
  // Bounded native response; never silently truncate an unknown source catalog.
  if (fields.length > 512) return null;
  return { version: 1, kind: "trip_source", ownerId, tripId: value.trip.id, headVersion: snapshot.version, title: snapshot.title, fields };
}

export function selectedTripTranslationText(source: TripTranslationSource, reference: TripTranslationReference): string | null {
  if (source.ownerId !== reference.ownerId || source.tripId !== reference.tripId || source.headVersion !== reference.headVersion) return null;
  return source.fields.find(field => field.dayId === reference.dayId && field.itemId === reference.itemId && field.field === reference.field)?.value ?? null;
}
