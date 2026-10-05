/** Synthetic source-backed cross-language wire fixture. No Auth, DB or provider proof. */
import { writeFileSync } from "node:fs";
import { candidateScopedEditsPatch, previewScopedPatch } from "../../../lib/server/trip/scoped-edit/candidate-guard.ts";
import { scopedEditDiff } from "../../../lib/server/trip/scoped-edit/diff.ts";
import { parseScopedContext, parseScopedReceipt } from "../../../lib/server/trip/scoped-edit/wire.ts";
import type { TripSnapshot } from "../../../lib/server/trip/patch/contract.ts";
const tripId = "11111111-1111-4111-8111-111111111111", contextId = "22222222-2222-4222-8222-222222222222", operationId = "33333333-3333-4333-8333-333333333333", candidateId = "44444444-4444-4444-8444-444444444444", selectId = "55555555-5555-4555-8555-555555555555", proposalId = "66666666-6666-4666-8666-666666666666", sha = "a".repeat(64);
const now = Date.now(), expiresAt = new Date(now + 590000).toISOString();
const snapshot: TripSnapshot = { version: 3, title: "Fixture trip", days: [{ id: "day-a", date: "2026-10-05", items: [{ id: "a", dayId: "day-a", title: "Current A" }, { id: "b", dayId: "day-a", title: "Preserved B" }, { id: "c", dayId: "day-a", title: "Current C" }] }] };
const scope = { dayIds: ["day-a"], itemIds: [] };
const context = { kind: "scoped_edit_context/1", tripId, contextId, contextDigest: sha, baseVersion: 3, scope, snapshot, orderedItemIdsByDay: [{ dayId: "day-a", itemIds: ["a", "b", "c"] }], lockedItemIds: ["b"], fixedItemIds: [], sourceBasis: { profileUpdatedAt: null, memoryBasisDigest: sha, reservationBasisDigest: sha, sourceDigest: sha, lockRevision: 1, fixedBindings: [] }, expiresAt };
const constraints = { scope, lockedItemIds: ["b"], fixedItemIds: [] };
const edits = [{ kind: "replace_item" as const, itemId: "a", sourceItemId: "b" }, { kind: "remove_item" as const, itemId: "c" }];
const patch = candidateScopedEditsPatch(snapshot, edits, constraints, { contextId, askOperationId: operationId, candidateId }), after = previewScopedPatch(snapshot, patch, constraints), diff = scopedEditDiff(snapshot, after);
const candidates = { kind: "scoped_edit_candidates/1", operationId, tripId, contextId, contextDigest: sha, baseVersion: 3, expiresAt, returnScope: scope, candidates: [{ candidateId, edits, diff }], reused: false };
const proposal = { kind: "scoped_edit_proposal/1", operationId: selectId, tripId, contextId, contextDigest: sha, baseVersion: 3, proposalId, proposalRevision: 1, proposalDigest: `trip-v2:${sha}`, expiresAt, returnScope: scope, diff, reused: false };
if (!parseScopedContext(context, tripId, now) || !parseScopedReceipt(candidates, tripId, operationId) || !parseScopedReceipt(proposal, tripId, selectId)) throw Error("Producer wire rejected");
const body = JSON.stringify({ verification: "synthetic_source_wire_only", now, context, candidates, proposal, patch, after }, null, 2);
if (process.argv[2]) writeFileSync(process.argv[2], body + "\n"); else process.stdout.write(body + "\n");
