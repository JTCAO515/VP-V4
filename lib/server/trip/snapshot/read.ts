import { assertTripSnapshot, type TripSnapshot, type TripPatch } from "../patch/contract.ts";

export function readStoredSnapshot(row: Readonly<{ version: number; title: string; content: unknown }>): TripSnapshot | null {
  if (!row.content || typeof row.content !== "object" || Array.isArray(row.content)) return null;
  const content = row.content as Record<string, unknown>;
  if (content.title !== row.title) return null;
  // PostgreSQL's original OF formatter writes whole-hour offsets as +00/+08.
  // Normalize only that stored representation; the strict snapshot/patch contract
  // still validates every field and no timestamp instant is changed.
  const days = Array.isArray(content.days) ? content.days.map(day => {
    if (!record(day) || !Array.isArray(day.items)) return day;
    return { ...day, items: day.items.map(item => {
      if (!record(item)) return item;
      return { ...item,
        ...(Object.hasOwn(item, "startsAt") ? { startsAt: storedTimestamp(item.startsAt) } : {}),
        ...(Object.hasOwn(item, "endsAt") ? { endsAt: storedTimestamp(item.endsAt) } : {}),
      };
    }) };
  }) : content.days;
  const snapshot = { version: row.version, title: row.title, days };
  try { assertTripSnapshot(snapshot); return snapshot; } catch { return null; }
}

const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
function storedTimestamp(v: unknown): unknown {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?[+-]\d{2}$/.test(v) ? v + ":00" : v;
}

/** Display the complete rollback effect through the existing TripPatch/diff vocabulary. */
export function snapshotRestorePatch(before: TripSnapshot, target: TripSnapshot): TripPatch {
  return { expectedVersion: before.version, operations: [
    { kind: "set_title", title: target.title },
    ...before.days.map(day => ({ kind: "delete_day" as const, dayId: day.id })),
    ...target.days.flatMap(day => [
      { kind: "upsert_day" as const, dayId: day.id, date: day.date, ...(day.timeZone ? { timeZone: day.timeZone } : {}) },
      ...(day.items ?? []).map(item => ({ kind: "upsert_item" as const, itemId: item.id, dayId: day.id, title: item.title, ...(item.startsAt ? { startsAt: item.startsAt } : {}), ...(item.endsAt ? { endsAt: item.endsAt } : {}) })),
      ...(day.items?.some(item => item.manualOrder !== undefined) ? [{ kind: "reorder_items" as const, dayId: day.id, itemIds: [...day.items].sort((a,b) => (a.manualOrder ?? Number.MAX_SAFE_INTEGER) - (b.manualOrder ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id)).map(item => item.id) }] : []),
    ]),
  ] };
}
