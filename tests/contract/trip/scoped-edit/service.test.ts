import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPatch, type TripSnapshot } from "../../../../lib/server/trip/patch/contract.ts";
import { draftTripPatch } from "../../../../lib/server/trip/patch/draft.ts";
import { describeProposalDiff } from "../../../../lib/server/trip/proposal/diff.ts";
import { manualScopedPatch, previewScopedPatch } from "../../../../lib/server/trip/scoped-edit/candidate-guard.ts";
import { parseScopedEditRequest } from "../../../../lib/server/trip/scoped-edit/contract.ts";
import { parseScopedContext, parseScopedOperation, type ScopedEditContext, type ScopedProposalReceipt } from "../../../../lib/server/trip/scoped-edit/wire.ts";
import { runScopedEdit, assertOriginalScopedProposal, type ScopedEditRPC } from "../../../../lib/server/trip/scoped-edit/service.ts";
import { scopedEditDiff } from "../../../../lib/server/trip/scoped-edit/diff.ts";
const trip = "11111111-1111-4111-8111-111111111111", op = "22222222-2222-4222-8222-222222222222", contextId = "33333333-3333-4333-8333-333333333333", proposalId = "44444444-4444-4444-8444-444444444444", sha = "a".repeat(64);
const now = Date.parse("2026-10-05T04:00:00Z"), expiry = "2026-10-05T04:10:00.000Z";
const base: TripSnapshot = { version: 3, title: "Trip", days: [{ id: "day-a", date: "2026-10-06", items: [{ id: "a", dayId: "day-a", title: "A" }, { id: "b", dayId: "day-a", title: "B", startsAt: "2026-10-06T08:00:00Z" }, { id: "c", dayId: "day-a", title: "C" }] }, { id: "day-b", date: "2026-10-07", items: [{ id: "d", dayId: "day-b", title: "D" }] }] };
const scope = { dayIds: [], itemIds: ["a", "c"] }, constraints = { scope, lockedItemIds: [], fixedItemIds: [] };
const basis = { contextId, contextDigest: sha, baseVersion: 3 };
const context: ScopedEditContext = { kind: "scoped_edit_context/1", contextId, contextDigest: sha, tripId: trip, baseVersion: 3, scope, snapshot: base, orderedItemIdsByDay: base.days.map(day => ({ dayId: day.id, itemIds: (day.items ?? []).map(i => i.id) })), lockedItemIds: [], fixedItemIds: [], sourceBasis: { profileUpdatedAt: null, memoryBasisDigest: sha, reservationBasisDigest: sha, sourceDigest: sha, lockRevision: 0, fixedBindings: [] }, expiresAt: expiry };
const mutation = { action: "manual" as const, operationId: op, basis, edit: { kind: "set_time" as const, itemId: "a", startsAt: "2026-10-06T09:00:00Z", endsAt: "2026-10-06T10:00:00Z" } };
function proposal() {
  const patch = manualScopedPatch(base, mutation.edit, constraints), after = previewScopedPatch(base, patch, constraints);
  const receipt: ScopedProposalReceipt = { kind: "scoped_edit_proposal/1", operationId: op, tripId: trip, contextId, contextDigest: sha, proposalId, proposalRevision: 7, proposalDigest: `trip-v2:${sha}`, baseVersion: 3, expiresAt: expiry, returnScope: scope, diff: scopedEditDiff(base, after), reused: false };
  return { receipt, patch, after, original: { id: proposalId, revision: 7, baseTripVersion: 3, digest: receipt.proposalDigest, expiresAt: expiry, stale: false, before: base, after, patch } };
}
const rpcData = (data: unknown) => ({ data, error: null });
test("closed request rejects authority, model patch, ambiguous operation and invalid time", () => {
  assert.ok(parseScopedEditRequest(mutation));
  for (const bad of [{ ...mutation, actor: trip }, { ...mutation, patch: {} }, { ...mutation, operationId: "ABCDEFAB-2222-4222-8222-222222222222" }, { ...mutation, edit: { ...mutation.edit, endsAt: "2026-10-06T07:00:00Z" } }, { action: "abandon", operationId: trip, mutation }, { action: "ask", operationId: op, basis, text: "" }]) assert.equal(parseScopedEditRequest(bad), null);
});
test("selection rejects missing/duplicate IDs and snapshot mismatch", () => {
  assert.throws(() => manualScopedPatch(base, mutation.edit, { ...constraints, scope: { dayIds: [], itemIds: ["missing"] } }));
  assert.equal(parseScopedEditRequest({ action: "context", expectedHeadVersion: 3, scope: { dayIds: [], itemIds: ["a", "a"] }, locale: "en" }), null);
});
test("direct time edit affects selected only, explicit null removes time", () => {
  const patch = manualScopedPatch(base, mutation.edit, constraints), next = previewScopedPatch(base, patch, constraints);
  assert.deepEqual(next.days[0].items?.slice(1), base.days[0].items?.slice(1));
  const clear = manualScopedPatch(next, { kind: "set_time", itemId: "a", startsAt: null, endsAt: null }, constraints);
  assert.equal(previewScopedPatch(next, clear, constraints).days[0].items?.[0].startsAt, undefined);
});
test("manual move preserves untouched fields and relative order through natural shift", () => {
  const patch = manualScopedPatch(base, { kind: "move_item", itemId: "a", toDayId: "day-b" }, constraints), next = previewScopedPatch(base, patch, constraints);
  assert.deepEqual(next.days[0].items, base.days[0].items?.slice(1));
  assert.deepEqual(next.days[1].items?.find(i => i.id === "d"), base.days[1].items?.[0]);
});
test("locked and fixed items are immutable even if explicitly selected", () => {
  for (const key of ["lockedItemIds", "fixedItemIds"] as const) assert.throws(() => manualScopedPatch(base, mutation.edit, { ...constraints, [key]: ["a"] }));
});
test("sorting permutes selected slots and persists only moved item order", () => {
  const patch = manualScopedPatch(base, { kind: "reorder_items", dayId: "day-a", itemIds: ["c", "a"] }, constraints), next = previewScopedPatch(base, patch, constraints);
  assert.deepEqual(next.days[0].items?.map(i => i.id), ["c", "b", "a"]);
  assert.deepEqual(next.days[0].items?.[1], base.days[0].items?.[1]);
  assert.equal(next.days[0].items?.[0].startsAt, undefined);
  assert.deepEqual(applyPatch(next, { expectedVersion: 4, operations: [{ kind: "set_title", title: "Renamed" }] }).days[0].items, next.days[0].items);
  assert.ok(describeProposalDiff(base, patch).dayDiffs[0].items.every(i => i.kind === "reordered"));
});
test("invalid order cannot touch unselected slots or omit/add/duplicate IDs", () => {
  for (const itemIds of [["b", "c", "a"], ["a", "c"], ["c", "b", "b"]]) assert.throws(() => previewScopedPatch(base, { expectedVersion: 3, operations: [{ kind: "reorder_items", dayId: "day-a", itemIds }] }, constraints));
});
test("general patch cannot rename Trip/day, remove unselected, or add outside selected days", () => {
  for (const operations of [[{ kind: "set_title", title: "Hacked" }], [{ kind: "delete_day", dayId: "day-b" }], [{ kind: "delete_item", dayId: "day-a", itemId: "b" }], [{ kind: "upsert_item", dayId: "day-b", itemId: "new", title: "N" }]] as const) assert.throws(() => previewScopedPatch(base, { expectedVersion: 3, operations }, constraints));
});
test("time edits preserve existing manualOrder", () => {
  const ordered = previewScopedPatch(base, manualScopedPatch(base, { kind: "reorder_items", dayId: "day-a", itemIds: ["c", "a"] }, constraints), constraints);
  const next = previewScopedPatch(ordered, manualScopedPatch(ordered, { ...mutation.edit, itemId: "c" }, constraints), constraints);
  assert.equal(next.days[0].items?.[0].manualOrder, 0);
  assert.deepEqual(next.days[0].items?.map(i => i.id), ["c", "b", "a"]);
});
test("draft emits a real order patch from reordered same-day objects", () => {
  const draft = { ...base, days: [{ ...base.days[0], items: [base.days[0].items![2], base.days[0].items![1], base.days[0].items![0]] }, base.days[1]] };
  assert.deepEqual(draftTripPatch(base, draft).operations, [{ kind: "reorder_items", dayId: "day-a", itemIds: ["c", "b", "a"] }]);
});
test("context validates TTL, exact ordered IDs, fixed provenance and closed metadata", () => {
  assert.ok(parseScopedContext(context, trip, now));
  for (const invalid of [{ ...context, expiresAt: "2026-10-05T04:10:01Z" }, { ...context, lockedItemIds: ["missing"] }, { ...context, fixedItemIds: ["a"] }, { ...context, sourceBasis: { ...context.sourceBasis, trusted: true } }, { ...context, orderedItemIdsByDay: [] }]) assert.equal(parseScopedContext(invalid, trip, now), null);
});
test("context service binds exactly the requested real base and passes explicit bindings", async () => {
  let parameters: unknown;
  const rpc: ScopedEditRPC = async (_name, p) => { parameters = p; return rpcData(context); };
  assert.equal(await runScopedEdit(trip, { action: "context", expectedHeadVersion: 3, scope, locale: "en" }, rpc, base, now), context);
  assert.deepEqual(parameters, { p_trip_id: trip, p_input: { expectedHeadVersion: 3, scope, locale: "en", reservationBindings: [] } });
  await assert.rejects(() => runScopedEdit(trip, { action: "context", expectedHeadVersion: 2, scope, locale: "en" }, rpc, base, now), /STALE_TRIP_VERSION/);
});
test("submit ACK requires original immutable mutation and matching exact receipt", async () => {
  const { receipt } = proposal(); let calls = 0;
  const rpc: ScopedEditRPC = async () => rpcData(calls++ === 0 ? receipt : { kind: "scoped_edit_operation/1", operationId: op, tripId: trip, mutation, receipt: { ...receipt, reused: true }, state: "pending", resultingVersion: null });
  assert.deepEqual(await runScopedEdit(trip, mutation, rpc, base, now), receipt);
  calls = 0;
  const wrong: ScopedEditRPC = async () => rpcData(calls++ === 0 ? receipt : { kind: "scoped_edit_operation/1", operationId: op, tripId: trip, mutation: { ...mutation, edit: { ...mutation.edit, itemId: "c" } }, receipt, state: "pending", resultingVersion: null });
  await assert.rejects(() => runScopedEdit(trip, mutation, wrong, base, now), /RECEIPT_UNKNOWN/);
});
test("original Proposal proof rejects revision/digest/base/diff/expiry/stale substitutions", () => {
  const { receipt, original } = proposal(); assertOriginalScopedProposal(receipt, original, now);
  for (const wrong of [{ ...original, revision: 8 }, { ...original, digest: `trip-v2:${"b".repeat(64)}` }, { ...original, baseTripVersion: 4 }, { ...original, stale: true }, { ...original, expiresAt: "2026-10-05T04:09:00Z" }]) assert.throws(() => assertOriginalScopedProposal(receipt, wrong, now), /RECEIPT_UNKNOWN/);
  assert.throws(() => assertOriginalScopedProposal({ ...receipt, diff: { ...receipt.diff, changes: [] } }, original, now), /RECEIPT_UNKNOWN/);
});
test("missing operation is unknown, never proof of an unexecuted or cancelled write", () => {
  assert.ok(parseScopedOperation({ kind: "scoped_edit_operation/1", operationId: op, tripId: trip, mutation: null, receipt: null, state: "unknown", resultingVersion: null }, trip, op));
  assert.equal(parseScopedOperation({ kind: "scoped_edit_operation/1", operationId: op, tripId: trip, mutation: null, receipt: null, state: "applied", resultingVersion: null }, trip, op), null);
});
test("abandon fences unsubmitted mutation but does not undo a committed Proposal", async () => {
  const { receipt } = proposal(), input = { action: "abandon" as const, operationId: op, mutation };
  for (const outcome of [{ state: "cancelled", receipt: null }, { state: "committed", receipt }]) {
    const raw = { kind: "scoped_edit_abandon/1", operationId: op, tripId: trip, ...outcome };
    assert.deepEqual(await runScopedEdit(trip, input, async () => rpcData(raw), base, now), raw);
  }
  await assert.rejects(() => runScopedEdit(trip, input, async () => rpcData({ kind: "scoped_edit_abandon/1", operationId: op, tripId: trip, state: "cancelled", receipt }), base, now), /RECEIPT_UNKNOWN/);
});
