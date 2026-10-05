import { createHash } from "node:crypto";
import { assertTripSnapshot, assertTripPatch, applyPatch, type TripSnapshot, type TripPatchOperation } from "../patch/contract.ts";
import { type EditScope, type ManualEdit, type CandidateEdit, validScope, validManualEdit, validCandidateEdit, uuid } from "./contract.ts";

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
    const nextOrder = (updated!.items ?? []).filter(i => before.has(i.id) && (!selected.has(i.id) || protectedIds.has(i.id))).map(i => i.id);
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
  for (let operationIndex = 0; operationIndex < patch.operations.length; operationIndex++) {
    const operation = patch.operations[operationIndex];
    if (operation.kind !== "reorder_items") continue;
    const previous = operationIndex === 0 ? base : applyPatch(base, { expectedVersion: base.version, operations: patch.operations.slice(0, operationIndex) });
    const current = applyPatch(base, { expectedVersion: base.version, operations: patch.operations.slice(0, operationIndex + 1) });
    const before = previous.days.find(d => d.id === operation.dayId), after = current.days.find(d => d.id === operation.dayId);
    if (!before || !after || canonical(after.items?.map(i => i.id)) !== canonical(operation.itemIds)) fail("INVALID_ORDER");
    for (let index = 0; index < (before!.items ?? []).length; index++) {
      const item = before!.items![index];
      if ((!selected.has(item.id) || protectedIds.has(item.id)) && operation.itemIds[index] !== item.id) fail("PROTECTED_SLOT_CHANGED");
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

/** Compile one model candidate through the same explicit edit language, then guard
 * the accumulated operations against the original base. Intermediate previews
 * cannot turn an unselected object into an editable object. */
export function manualScopedEditsPatch(base: TripSnapshot, edits: readonly ManualEdit[], constraints: ScopeConstraints): ScopedPatch {
  if (edits.length < 1 || edits.length > 16) fail("INVALID_INPUT");
  const expanded = { ...constraints, scope: { dayIds: constraints.scope.dayIds, itemIds: [...selectedItems(base, constraints.scope)] } };
  const operations: ScopedPatchOperation[] = [];
  let current = base;
  for (const edit of edits) {
    const patch = manualScopedPatch(current, edit, expanded);
    operations.push(...patch.operations);
    current = { ...previewScopedPatch(current, patch, expanded), version: base.version };
  }
  const patch = { expectedVersion: base.version, operations };
  previewScopedPatch(base, patch, constraints);
  return patch;
}

/** New and replacement entries reference only existing same-Trip objects. Model
 * output cannot supply a title, identifier for a new object, fact or qualification. */
export type CandidateIdentity = Readonly<{ contextId: string; askOperationId: string; candidateId: string }>;
export function candidateScopedEditsPatch(base: TripSnapshot, edits: readonly CandidateEdit[], constraints: ScopeConstraints, identity: CandidateIdentity): ScopedPatch {
  if (![identity.contextId, identity.askOperationId, identity.candidateId].every(uuid)) fail("INVALID_IDENTITY");
  if (edits.length < 1 || edits.length > 16 || !edits.every(validCandidateEdit)) fail("INVALID_INPUT");
  const selected = selectedItems(base, constraints.scope), originalItems = allItems(base);
  const expanded = { ...constraints, scope: { dayIds: constraints.scope.dayIds, itemIds: [...selected] } };
  const protectedIds = new Set([...constraints.lockedItemIds, ...constraints.fixedItemIds]);
  const operations: ScopedPatchOperation[] = [];
  let current = base;
  for (let index = 0; index < edits.length; index++) {
    const edit = edits[index]; let patch: ScopedPatch;
    if (validManualEdit(edit)) {
      if (edit.kind !== "reorder_items" && !selected.has(edit.itemId)) fail("OUTSIDE_SCOPE");
      const available = allItems(current);
      const stepConstraints = { ...expanded, scope: { dayIds: [], itemIds: [...selected].filter(id => available.has(id)) } };
      patch = manualScopedPatch(current, edit, stepConstraints);
    }
    else if (edit.kind === "remove_item") {
      const item = allItems(current).get(edit.itemId);
      if (!item || !selected.has(edit.itemId) || protectedIds.has(edit.itemId)) fail("PROTECTED_ITEM_CHANGED");
      patch = { expectedVersion: base.version, operations: [{ kind: "delete_item", itemId: item!.id, dayId: item!.dayId }] };
    } else if (edit.kind === "replace_item") {
      const item = allItems(current).get(edit.itemId), source = originalItems.get(edit.sourceItemId);
      if (!item || !source || !selected.has(edit.itemId) || protectedIds.has(edit.itemId)) fail("PROTECTED_ITEM_CHANGED");
      if (item!.title === source!.title) fail("NO_CHANGE");
      patch = { expectedVersion: base.version, operations: [{ kind: "upsert_item", itemId: item!.id, dayId: item!.dayId, title: source!.title, ...(item!.startsAt ? { startsAt: item!.startsAt } : {}), ...(item!.endsAt ? { endsAt: item!.endsAt } : {}) }] };
    } else {
      const source = originalItems.get(edit.sourceItemId);
      if (!source || !constraints.scope.dayIds.includes(edit.toDayId) || !base.days.some(d => d.id === edit.toDayId)) fail("ADD_OUTSIDE_SCOPE");
      const itemId = "edit-" + createHash("sha256").update(JSON.stringify(["scoped-trip-edit-item/1", identity.contextId, identity.askOperationId, identity.candidateId, index])).digest("hex").slice(0, 32);
      if (allItems(current).has(itemId)) fail("ID_CONFLICT");
      patch = { expectedVersion: base.version, operations: [{ kind: "upsert_item", itemId, dayId: edit.toDayId, title: source!.title }] };
    }
    operations.push(...patch.operations);
    const next = applyPatch(current, patch);
    // Validate against the original selection, so a removed item does not make
    // the remaining sequence fail merely because its original id is now absent.
    assertScopedCandidate(base, { ...next, version: base.version + 1 }, constraints);
    current = { ...next, version: base.version };
  }
  const patch = { expectedVersion: base.version, operations };
  previewScopedPatch(base, patch, constraints);
  if (canonical(current) === canonical(base)) fail("NO_CHANGE");
  return patch;
}
