import { assertTripSnapshot, assertTripPatch, applyPatch, type TripSnapshot, type TripPatchOperation } from "../patch/contract.ts";
import { type EditScope, type ManualEdit, validScope, validManualEdit } from "./contract.ts";

export type ScopedPatchOperation = TripPatchOperation | Readonly<{ kind: "reorder_items"; dayId: string; itemIds: readonly string[] }>;
export type ScopedPatch = Readonly<{ expectedVersion: number; operations: readonly ScopedPatchOperation[] }>;
export type ScopeConstraints = Readonly<{ scope: EditScope; lockedItemIds: readonly string[]; fixedItemIds: readonly string[] }>;
export class ScopedEditGuardError extends Error {}
const fail = (why: string): never => { throw new ScopedEditGuardError(why); };
const canonical = (v: unknown): string => JSON.stringify(v, (_key, value) => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
const allItems = (s: TripSnapshot) => new Map(s.days.flatMap(d => (d.items ?? []).map(i => [i.id, i] as const)));
export function selectedItems(base: TripSnapshot, scope: EditScope): ReadonlySet<string> {
  assertTripSnapshot(base);
  if (!validScope(scope) || scope.dayIds.some(id => !base.days.some(d => d.id === id)) || scope.itemIds.some(id => !allItems(base).has(id))) fail("INVALID_SCOPE");
  const selected = new Set([...scope.itemIds, ...base.days.filter(d => scope.dayIds.includes(d.id)).flatMap(d => (d.items ?? []).map(i => i.id))]);
  if (selected.size > 64) fail("SCOPE_TOO_LARGE");
  return selected;
}
/** Domain guard, never authority: SQL repeats these constraints under its write lock.
 * Unknown metadata is retained in equality checks rather than projected away. */
export function assertScopedCandidate(base: TripSnapshot, next: TripSnapshot, constraints: ScopeConstraints): void {
  assertTripSnapshot(next);
  const selected = selectedItems(base, constraints.scope), before = allItems(base), after = allItems(next);
  const protectedIds = new Set([...constraints.lockedItemIds, ...constraints.fixedItemIds]);
  if ([...protectedIds].some(id => !before.has(id))) fail("INVALID_FIXED_BASIS");
  if (next.version !== base.version + 1 || next.title !== base.title || base.days.length !== next.days.length) fail("OUTSIDE_SCOPE");
  for (const day of base.days) {
    const updated = next.days.find(d => d.id === day.id);
    if (!updated || canonical({ ...day, items: undefined }) !== canonical({ ...updated, items: undefined })) fail("DAY_CHANGED");
    const protectedOrder = (day.items ?? []).filter(i => !selected.has(i.id) || protectedIds.has(i.id)).map(i => i.id);
    const nextOrder = (updated!.items ?? []).filter(i => !selected.has(i.id) || protectedIds.has(i.id)).map(i => i.id);
    if (canonical(protectedOrder) !== canonical(nextOrder)) fail("PROTECTED_ORDER_CHANGED");
  }
  for (const [id, item] of before) if (!selected.has(id) || protectedIds.has(id)) {
    if (canonical(item) !== canonical(after.get(id))) fail("PROTECTED_ITEM_CHANGED");
  }
  for (const [id, item] of after) if (!before.has(id) && !constraints.scope.dayIds.includes(item.dayId)) fail("ADD_OUTSIDE_SCOPE");
}
/** Apply the existing content language, then persist explicit order via its proposed
 * closed extension. The original array order is preserved for untouched items. */
export function previewScopedPatch(base: TripSnapshot, patch: ScopedPatch, constraints: ScopeConstraints): TripSnapshot {
  if (patch.expectedVersion !== base.version || patch.operations.length < 1 || patch.operations.length > 128) fail("INVALID_PATCH");
  assertTripPatch(patch);
  const next = applyPatch(base, patch);
  const selected = selectedItems(base, constraints.scope), protectedIds = new Set([...constraints.lockedItemIds, ...constraints.fixedItemIds]);
  const seen = new Set<string>();
  for (const o of patch.operations) if (o.kind === "reorder_items") {
    if (seen.has(o.dayId)) fail("DUPLICATE_REORDER"); seen.add(o.dayId);
    const before = base.days.find(d => d.id === o.dayId), after = next.days.find(d => d.id === o.dayId);
    if (!before || !after || canonical(after.items?.map(i => i.id)) !== canonical(o.itemIds)) fail("INVALID_ORDER");
    for (let index = 0; index < (before!.items ?? []).length; index++) {
      const item = before!.items![index];
      if ((!selected.has(item.id) || protectedIds.has(item.id)) && o.itemIds[index] !== item.id) fail("PROTECTED_SLOT_CHANGED");
    }
  }
  assertScopedCandidate(base, next, constraints);
  return next;
}
export function manualScopedPatch(base: TripSnapshot, edit: ManualEdit, constraints: ScopeConstraints): ScopedPatch {
  if (!validManualEdit(edit)) fail("INVALID_INPUT");
  const selected = selectedItems(base, constraints.scope), protectedIds = new Set([...constraints.lockedItemIds, ...constraints.fixedItemIds]);
  const operations: ScopedPatchOperation[] = [];
  if (edit.kind === "reorder_items") {
    const day = base.days.find(d => d.id === edit.dayId); if (!day) fail("INVALID_SCOPE");
    const movable = (day!.items ?? []).filter(i => selected.has(i.id) && !protectedIds.has(i.id));
    if (edit.itemIds.length !== movable.length || edit.itemIds.some(id => !movable.some(i => i.id === id))) fail("INVALID_ORDER");
    let cursor = 0;
    operations.push({ kind: "reorder_items", dayId: day!.id, itemIds: (day!.items ?? []).map(i => selected.has(i.id) && !protectedIds.has(i.id) ? edit.itemIds[cursor++] : i.id) });
  } else {
    const item = allItems(base).get(edit.itemId);
    if (!item || !selected.has(item.id) || protectedIds.has(item.id)) fail("PROTECTED_ITEM_CHANGED");
    if (edit.kind === "move_item") {
      if (!base.days.some(d => d.id === edit.toDayId) || edit.toDayId === item!.dayId) fail("INVALID_DESTINATION");
      operations.push({ kind: "delete_item", itemId: item!.id, dayId: item!.dayId }, { kind: "upsert_item", itemId: item!.id, dayId: edit.toDayId, title: item!.title, ...(item!.startsAt ? { startsAt: item!.startsAt } : {}), ...(item!.endsAt ? { endsAt: item!.endsAt } : {}) });
    } else operations.push({ kind: "upsert_item", itemId: item!.id, dayId: item!.dayId, title: item!.title, ...(edit.startsAt !== null ? { startsAt: edit.startsAt } : {}), ...(edit.endsAt !== null ? { endsAt: edit.endsAt } : {}) });
  }
  const patch = { expectedVersion: base.version, operations };
  const next = previewScopedPatch(base, patch, constraints);
  if (canonical({ ...next, version: base.version }) === canonical(base)) fail("NO_CHANGE");
  return patch;
}
