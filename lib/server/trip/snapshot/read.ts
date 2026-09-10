import { assertTripSnapshot, type TripSnapshot, type TripPatch } from "../patch/contract.ts";

export function readStoredSnapshot(row: Readonly<{ version: number; title: string; content: unknown }>): TripSnapshot | null {
  if (!row.content || typeof row.content !== "object" || Array.isArray(row.content)) return null;
  const content = row.content as Record<string, unknown>;
  if (content.title !== row.title) return null;
  const snapshot = { version: row.version, title: row.title, days: content.days };
  try { assertTripSnapshot(snapshot); return snapshot; } catch { return null; }
}

/** Display the complete rollback effect through the existing TripPatch/diff vocabulary. */
export function snapshotRestorePatch(before: TripSnapshot, target: TripSnapshot): TripPatch {
  return { expectedVersion: before.version, operations: [
    { kind: "set_title", title: target.title },
    ...before.days.map(day => ({ kind: "delete_day" as const, dayId: day.id })),
    ...target.days.flatMap(day => [
      { kind: "upsert_day" as const, dayId: day.id, date: day.date, ...(day.timeZone ? { timeZone: day.timeZone } : {}) },
      ...(day.items ?? []).map(item => ({ kind: "upsert_item" as const, itemId: item.id, dayId: day.id, title: item.title, ...(item.startsAt ? { startsAt: item.startsAt } : {}), ...(item.endsAt ? { endsAt: item.endsAt } : {}) })),
    ]),
  ] };
}
