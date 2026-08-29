export type TripItem = Readonly<{ id: string; dayId: string; title: string; startsAt?: string; endsAt?: string }>;
export type TripDay = Readonly<{ id: string; date: string; timeZone?: string; items?: readonly TripItem[] }>;
export type TripSnapshot = Readonly<{ version: number; title: string; days: readonly TripDay[] }>;
export type TripPatchOperation =
  | Readonly<{ kind: "set_title"; title: string }>
  | Readonly<{ kind: "upsert_day"; dayId: string; date: string; timeZone?: string }>
  | Readonly<{ kind: "delete_day"; dayId: string }>
  | Readonly<{ kind: "upsert_item"; itemId: string; dayId: string; title: string; startsAt?: string; endsAt?: string }>
  | Readonly<{ kind: "delete_item"; itemId: string; dayId: string }>;
export type TripPatch = Readonly<{ expectedVersion: number; operations: readonly TripPatchOperation[] }>;

export class InvalidTripPatchError extends Error {}

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const TIME_ZONE = /^[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)+$/;

export function assertTripPatch(patch: TripPatch): void {
  if (!isRecord(patch) || !hasOnlyKeys(patch, ["expectedVersion", "operations"]) || !Number.isInteger(patch.expectedVersion) || patch.expectedVersion < 0) fail("expectedVersion required");
  if (!Array.isArray(patch.operations) || patch.operations.length === 0) fail("operations required");
  for (const operation of patch.operations) assertOperation(operation);
}

export function applyPatch(snapshot: TripSnapshot, patch: TripPatch): TripSnapshot {
  assertSnapshot(snapshot);
  assertTripPatch(patch);
  if (snapshot.version !== patch.expectedVersion) fail("stale version");
  let title = snapshot.title;
  const days = new Map(snapshot.days.map((day) => [day.id, { ...day, items: [...(day.items ?? [])] }]));
  for (const operation of patch.operations) {
    switch (operation.kind) {
      case "set_title": title = operation.title.trim(); break;
      case "upsert_day": { const previous = days.get(operation.dayId); days.set(operation.dayId, { id: operation.dayId, date: operation.date, ...(operation.timeZone ? { timeZone: operation.timeZone } : {}), items: previous?.items ?? [] }); break; }
      case "delete_day": if (!days.delete(operation.dayId)) fail("day not found"); break;
      case "upsert_item": { const day = days.get(operation.dayId); if (!day) fail("item day not found"); const items = new Map((day.items ?? []).map((item) => [item.id, item])); items.set(operation.itemId, itemFrom(operation)); days.set(day.id, { ...day, items: [...items.values()] }); break; }
      case "delete_item": { const day = days.get(operation.dayId); if (!day) fail("item day not found"); const items = new Map((day.items ?? []).map((item) => [item.id, item])); if (!items.delete(operation.itemId)) fail("item not found"); days.set(day.id, { ...day, items: [...items.values()] }); }
    }
  }
  const resultDays = [...days.values()].sort(compareDay).map((day) => freezeDay(day));
  const dates = new Set<string>();
  for (const day of resultDays) { if (dates.has(day.date)) fail("duplicate day date"); dates.add(day.date); }
  return Object.freeze({ version: snapshot.version + 1, title, days: Object.freeze(resultDays) });
}

function assertOperation(operation: unknown): asserts operation is TripPatchOperation {
  if (!isRecord(operation) || typeof operation.kind !== "string") fail("operation required");
  switch (operation.kind) {
    case "set_title": if (!hasOnlyKeys(operation, ["kind", "title"]) || !validTitle(operation.title)) fail("title required"); return;
    case "upsert_day": if (!hasOnlyKeys(operation, ["kind", "dayId", "date", "timeZone"]) || !validId(operation.dayId) || !validDate(operation.date) || (operation.timeZone !== undefined && !validTimeZone(operation.timeZone))) fail("invalid day"); return;
    case "delete_day": if (!hasOnlyKeys(operation, ["kind", "dayId"]) || !validId(operation.dayId)) fail("dayId required"); return;
    case "upsert_item": if (!hasOnlyKeys(operation, ["kind", "itemId", "dayId", "title", "startsAt", "endsAt"]) || !validId(operation.itemId) || !validId(operation.dayId) || !validTitle(operation.title) || !validWindow(operation.startsAt, operation.endsAt)) fail("invalid item"); return;
    case "delete_item": if (!hasOnlyKeys(operation, ["kind", "itemId", "dayId"]) || !validId(operation.itemId) || !validId(operation.dayId)) fail("invalid item"); return;
    default: fail("unknown operation");
  }
}

function assertSnapshot(snapshot: TripSnapshot): void {
  if (!isRecord(snapshot) || !Number.isInteger(snapshot.version) || snapshot.version < 0 || !validTitle(snapshot.title) || !Array.isArray(snapshot.days)) fail("invalid snapshot");
  const ids = new Set<string>(); const dates = new Set<string>(); const itemIds = new Set<string>();
  for (const day of snapshot.days) {
    if (!isRecord(day) || !validId(day.id) || !validDate(day.date) || (day.timeZone !== undefined && !validTimeZone(day.timeZone)) || ids.has(day.id) || dates.has(day.date) || !Array.isArray(day.items ?? [])) fail("invalid snapshot day");
    ids.add(day.id); dates.add(day.date);
    const items: readonly unknown[] = Array.isArray(day.items) ? day.items : [];
    for (const item of items) { if (!isRecord(item) || !validId(item.id) || item.dayId !== day.id || !validTitle(item.title) || !validWindow(item.startsAt, item.endsAt) || itemIds.has(item.id)) fail("invalid snapshot item"); itemIds.add(item.id); }
  }
}

function itemFrom(operation: Extract<TripPatchOperation, { kind: "upsert_item" }>): TripItem { return { id: operation.itemId, dayId: operation.dayId, title: operation.title.trim(), ...(operation.startsAt ? { startsAt: operation.startsAt } : {}), ...(operation.endsAt ? { endsAt: operation.endsAt } : {}) }; }
function freezeDay(day: TripDay): TripDay { return Object.freeze({ ...day, ...(day.items ? { items: Object.freeze([...day.items].sort((left, right) => left.id.localeCompare(right.id)).map((item) => Object.freeze({ ...item }))) } : {}) }); }
function compareDay(left: TripDay, right: TripDay): number { return left.date.localeCompare(right.date) || left.id.localeCompare(right.id); }
function validId(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function validTitle(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 160; }
function validDate(value: unknown): value is string { const match = typeof value === "string" ? DATE.exec(value) : null; if (!match) return false; const date = new Date(`${value}T00:00:00.000Z`); return !Number.isNaN(date.valueOf()) && date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() + 1 === Number(match[2]) && date.getUTCDate() === Number(match[3]); }
function validTimeZone(value: unknown): value is string { return typeof value === "string" && TIME_ZONE.test(value) && value.length <= 64; }
function validWindow(startsAt: unknown, endsAt: unknown): boolean { if (startsAt !== undefined && (typeof startsAt !== "string" || !TIMESTAMP.test(startsAt) || Number.isNaN(Date.parse(startsAt)))) return false; if (endsAt !== undefined && (typeof endsAt !== "string" || !TIMESTAMP.test(endsAt) || Number.isNaN(Date.parse(endsAt)))) return false; return !(typeof startsAt === "string" && typeof endsAt === "string" && Date.parse(endsAt) <= Date.parse(startsAt)); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean { return Object.keys(value).every((key) => allowed.includes(key)); }
function fail(message: string): never { throw new InvalidTripPatchError(message); }
