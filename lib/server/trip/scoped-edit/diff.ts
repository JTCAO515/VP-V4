import type { TripSnapshot } from "../patch/contract.ts";
import { sameValue, type ScopedEditDiff } from "./wire.ts";
/** Movement and time edits are distinct from bookings or evidence-backed routing. */
export function scopedEditDiff(before: TripSnapshot, after: TripSnapshot): ScopedEditDiff {
  const previous = new Map(before.days.flatMap(day => (day.items ?? []).map(item => [item.id, item] as const)));
  const next = new Map(after.days.flatMap(day => (day.items ?? []).map(item => [item.id, item] as const)));
  const changes: ScopedEditDiff["changes"][number][] = [], preservedItemIds: string[] = [];
  for (const id of [...new Set([...previous.keys(), ...next.keys()])].sort()) {
    const left = previous.get(id), right = next.get(id);
    if (sameValue(left, right)) { preservedItemIds.push(id); continue; }
    const kind = !left ? "added" : !right ? "removed" : left.dayId !== right.dayId ? "moved" : sameValue({ ...left, manualOrder: undefined }, { ...right, manualOrder: undefined }) ? "reordered" : "changed";
    changes.push({ kind, itemId: id, before: left ?? null, after: right ?? null });
  }
  return { changes, preservedItemIds, transferImpact: "pending", walkingImprovement: "unverified", externalOrderEffect: "none" };
}
