import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScopedReceipt, parseScopedOperation } from "../../../../lib/server/trip/scoped-edit/wire.ts";
import { runScopedEdit, operationProposal, operationCandidates } from "../../../../lib/server/trip/scoped-edit/service.ts";
const tripId = "11111111-1111-4111-8111-111111111111", operationId = "22222222-2222-4222-8222-222222222222", contextId = "33333333-3333-4333-8333-333333333333", sha = "a".repeat(64);
const mutation = { action: "ask" as const, operationId, basis: { contextId, contextDigest: sha, baseVersion: 3 }, text: "Change this scope" };
test("durable exact declined receipt is a result, distinct from cancellation, Proposal rejection and unknown", async () => {
  for (const reason of ["unsupported_request", "no_change", "safety_refused"]) {
    const receipt = { kind: "scoped_edit_declined/1", operationId, tripId, contextId, contextDigest: sha, baseVersion: 3, reason, reused: true };
    const operation = { kind: "scoped_edit_operation/1", operationId, tripId, mutation, receipt, state: "declined", resultingVersion: null };
    assert.ok(parseScopedReceipt(receipt, tripId, operationId)); assert.ok(parseScopedOperation(operation, tripId, operationId));
    assert.equal(operationProposal(parseScopedOperation(operation, tripId, operationId)!), null);
    assert.equal(operationCandidates(parseScopedOperation(operation, tripId, operationId)!), null);
    const result = await runScopedEdit(tripId, mutation, async name => ({ data: name === "submit_scoped_trip_edit_v1" ? receipt : operation, error: null }), { version: 3, title: "Trip", days: [] }, Date.now());
    assert.deepEqual(result, receipt);
    assert.equal(parseScopedReceipt({ ...receipt, reason: "timeout" }, tripId, operationId), null);
    assert.equal(parseScopedReceipt({ ...receipt, providerVerified: true }, tripId, operationId), null);
    assert.equal(parseScopedOperation({ ...operation, state: "cancelled" }, tripId, operationId), null);
    assert.equal(parseScopedOperation({ ...operation, state: "declined", receipt: null }, tripId, operationId), null);
    assert.equal(parseScopedOperation({ ...operation, resultingVersion: 4 }, tripId, operationId), null);
  }
});
