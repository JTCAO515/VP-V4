import { test } from "node:test";
import assert from "node:assert/strict";
import { type TripSnapshot } from "../../../../lib/server/trip/patch/contract.ts";
import { candidateScopedEditsPatch, previewScopedPatch } from "../../../../lib/server/trip/scoped-edit/candidate-guard.ts";
import { parseScopedEditRequest, type CandidateEdit, validCandidateEdit } from "../../../../lib/server/trip/scoped-edit/contract.ts";
import { parseScopedReceipt, type ScopedCandidatesReceipt } from "../../../../lib/server/trip/scoped-edit/wire.ts";
import { assertScopedCandidates, operationProposal, runScopedEdit } from "../../../../lib/server/trip/scoped-edit/service.ts";
import { scopedEditDiff } from "../../../../lib/server/trip/scoped-edit/diff.ts";
const tripId = "11111111-1111-4111-8111-111111111111", operationId = "22222222-2222-4222-8222-222222222222", contextId = "33333333-3333-4333-8333-333333333333", candidateId = "44444444-4444-4444-8444-444444444444", sha = "a".repeat(64), expiresAt = "2026-10-05T04:10:00Z", now = Date.parse("2026-10-05T04:00:00Z");
const base: TripSnapshot = { version: 1, title: "Trip", days: [{ id: "day", date: "2026-10-05", items: [{ id: "a", dayId: "day", title: "A" }, { id: "b", dayId: "day", title: "B" }, { id: "c", dayId: "day", title: "C" }] }] };
const constraints = { scope: { dayIds: ["day"], itemIds: [] }, lockedItemIds: ["b"], fixedItemIds: [] };
const identity = { contextId, askOperationId: operationId, candidateId };
function candidate(edits: CandidateEdit[]): ScopedCandidatesReceipt {
  const patch = candidateScopedEditsPatch(base, edits, constraints, identity), next = previewScopedPatch(base, patch, constraints);
  return { kind: "scoped_edit_candidates/1", operationId, tripId, contextId, contextDigest: sha, baseVersion: 1, expiresAt, returnScope: constraints.scope, candidates: [{ candidateId, edits, diff: scopedEditDiff(base, next) }], reused: false };
}
test("add reuses a real current item, generates server-bound ID and has no invented time", () => {
  const edits: CandidateEdit[] = [{ kind: "add_item", sourceItemId: "b", toDayId: "day" }];
  const patch = candidateScopedEditsPatch(base, edits, constraints, identity), again = candidateScopedEditsPatch(base, edits, constraints, identity);
  assert.deepEqual(patch, again);
  const next = previewScopedPatch(base, patch, constraints), added = next.days[0].items?.find(i => i.id.startsWith("edit-"));
  assert.equal(added?.title, "B"); assert.equal(added?.startsAt, undefined);
  assert.deepEqual(next.days[0].items?.filter(i => !i.id.startsWith("edit-")), base.days[0].items);
  assert.notDeepEqual(candidateScopedEditsPatch(base, edits, constraints, { ...identity, candidateId: tripId }), patch);
});
test("add rejects item-only scope, missing source, arbitrary title/POI and id injection", () => {
  assert.throws(() => candidateScopedEditsPatch(base, [{ kind: "add_item", sourceItemId: "a", toDayId: "day" }], { ...constraints, scope: { dayIds: [], itemIds: ["a"] } }, identity));
  assert.throws(() => candidateScopedEditsPatch(base, [{ kind: "add_item", sourceItemId: "missing", toDayId: "day" }], constraints, identity));
  for (const invalid of [{ kind: "add_item", sourceItemId: "a", toDayId: "day", title: "Unknown place" }, { kind: "add_item", sourceItemId: "a", toDayId: "day", itemId: "injected" }, { kind: "replace_item", itemId: "a", sourceItemId: "b", provider: "verified" }]) assert.equal(validCandidateEdit(invalid), false);
});
test("replace/remove produce actual before-after effects while preserving locked object", () => {
  const receipt = candidate([{ kind: "replace_item", itemId: "a", sourceItemId: "b" }, { kind: "remove_item", itemId: "c" }]);
  assert.deepEqual(receipt.candidates[0].diff.changes.map(c => c.kind), ["replaced", "removed"]);
  assert.deepEqual(receipt.candidates[0].diff.preservedItemIds, ["b"]);
  assertScopedCandidates(receipt, base, now);
});
test("remove followed by a manual edit uses original surviving selection only", () => {
  const receipt = candidate([{ kind: "remove_item", itemId: "a" }, { kind: "set_time", itemId: "c", startsAt: "2026-10-05T09:00:00Z", endsAt: null }]);
  assertScopedCandidates(receipt, base, now);
  assert.deepEqual(receipt.candidates[0].diff.changes.map(c => c.kind), ["removed", "changed"]);
});
test("replace/remove cannot alter locked/fixed/unselected objects", () => {
  for (const edit of [{ kind: "remove_item", itemId: "b" }, { kind: "replace_item", itemId: "b", sourceItemId: "a" }] as CandidateEdit[]) assert.throws(() => candidateScopedEditsPatch(base, [edit], constraints, identity));
  assert.throws(() => candidateScopedEditsPatch(base, [{ kind: "remove_item", itemId: "c" }], { ...constraints, scope: { dayIds: [], itemIds: ["a"] } }, identity));
});
test("read-only candidate receipt never contains original Proposal confirmation authority", () => {
  const receipt = candidate([{ kind: "remove_item", itemId: "a" }]);
  assert.ok(parseScopedReceipt(receipt, tripId, operationId)); assert.equal(operationProposal(receipt), null);
  assert.equal(parseScopedReceipt({ ...receipt, proposalId: candidateId }, tripId, operationId), null);
  assert.throws(() => assertScopedCandidates({ ...receipt, candidates: [{ ...receipt.candidates[0], diff: { ...receipt.candidates[0].diff, changes: [] } }] }, base, now));
});
test("select requires independent mutation identity and never accepts a client patch", () => {
  const input = { action: "select_candidate", operationId: tripId, basis: { contextId, contextDigest: sha, baseVersion: 1 }, askOperationId: operationId, candidateId };
  assert.ok(parseScopedEditRequest(input));
  assert.equal(parseScopedEditRequest({ ...input, operationId }), null);
  assert.equal(parseScopedEditRequest({ ...input, patch: {} }), null);
});
test("operation polling invokes only the read RPC and cannot create a Proposal", async () => {
  const receipt = candidate([{ kind: "remove_item", itemId: "a" }]), called: string[] = [];
  const ask = { action: "ask", operationId, basis: { contextId, contextDigest: sha, baseVersion: 1 }, text: "Remove A" };
  const data = { kind: "scoped_edit_operation/1", operationId, tripId, mutation: ask, receipt, state: "pending", resultingVersion: null };
  await runScopedEdit(tripId, { action: "read_operation", operationId }, async name => { called.push(name); return { data, error: null }; }, base, now);
  assert.deepEqual(called, ["read_scoped_trip_edit_operation_v1"]);
});
