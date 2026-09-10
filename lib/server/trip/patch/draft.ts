import { type TripSnapshot, type TripPatch, type TripPatchOperation } from "./contract.ts";

/** Turn explicit edits into the existing proposal language; never apply a confirmed write here. */
export function draftTripPatch(base: TripSnapshot, draft: TripSnapshot): TripPatch {
  const operations: TripPatchOperation[] = [];
  if (base.title !== draft.title) operations.push({ kind: "set_title", title: draft.title });
  const nextDays = new Map(draft.days.map(day => [day.id, day]));
  for (const day of base.days) {
    const next = nextDays.get(day.id);
    if (!next) { operations.push({ kind: "delete_day", dayId: day.id }); continue; }
    for (const item of day.items ?? []) if (!(next.items ?? []).some(value => value.id === item.id)) operations.push({ kind: "delete_item", dayId: day.id, itemId: item.id });
  }
  for (const day of draft.days) {
    const previous = base.days.find(value => value.id === day.id);
    if (!previous || previous.date !== day.date || previous.timeZone !== day.timeZone) operations.push({ kind: "upsert_day", dayId: day.id, date: day.date, ...(day.timeZone ? { timeZone: day.timeZone } : {}) });
    for (const item of day.items ?? []) {
      const old = previous?.items?.find(value => value.id === item.id);
      if (!old || old.title !== item.title || old.startsAt !== item.startsAt || old.endsAt !== item.endsAt) operations.push({ kind: "upsert_item", itemId: item.id, dayId: day.id, title: item.title, ...(item.startsAt ? { startsAt: item.startsAt } : {}), ...(item.endsAt ? { endsAt: item.endsAt } : {}) });
    }
  }
  return { expectedVersion: base.version, operations };
}
