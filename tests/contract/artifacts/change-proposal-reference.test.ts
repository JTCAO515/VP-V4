import test from "node:test";
import assert from "node:assert/strict";
import { parseChangeProposalReference, parseChangeProposalReferenceRead } from "../../../lib/server/artifacts/change-proposal-reference.ts";
import { parseResultArtifactRead } from "../../../lib/server/artifacts/result-contract.ts";
const id = "11111111-1111-4111-8111-111111111111";
const content = { schemaVersion: "change-proposal-reference/1", proposalId: id, proposalRevision: 1, actions: [] };
const read = { kind: "result_artifact", artifactId: id, revision: 1, currentRevision: 1, current: true,
  historicalReadable: true, lifecycle: "active", createdAt: "2026-10-02T00:00:00Z",
  source: { taskId: id, taskTurnId: id, goalId: id, goalVersion: 2, inputMessageId: id, inputSequence: 3, tripId: id, tripVersion: 0 },
  basis: { memories: [], evidence: [] }, content };
test("reference contract contains only canonical identity/revision and no executable confirmation material", () => {
  assert.deepEqual(parseChangeProposalReference(content), content);
  assert.deepEqual(parseChangeProposalReferenceRead(read), read);
  assert.equal(parseResultArtifactRead(read), null, "legacy comparison consumer rejects this type");
  for (const key of ["patch", "digest", "confirm", "url", "title", "tripId", "baseTripVersion"]) {
    assert.equal(parseChangeProposalReference({ ...content, [key]: "must not copy" }), null);
  }
  for (const value of [{ ...content, actions: [{ type: "confirm" }] }, { ...content, schemaVersion: "change-proposal-reference/99" },
    { ...content, proposalId: "not-owned-id" }, { ...content, proposalRevision: 0 }, { ...content, proposalRevision: 1.5 },
    { ...content, proposalRevision: 2147483648 }, { schemaVersion: content.schemaVersion, proposalId: id, proposalRevision: 1 }]) {
    assert.equal(parseChangeProposalReference(value), null);
  }
});
test("reference read requires the exact current Trip-bound receipt; absent fields and unknown payloads fail closed", () => {
  for (const value of [{ ...read, current: false }, { ...read, revision: 2 }, { ...read, lifecycle: "withdrawn" },
    { ...read, source: { ...read.source, tripId: null, tripVersion: null } }, { ...read, basis: { memories: [], evidence: [id] } },
    { ...read, source: { ...read.source, inputSequence: 0 } }, { ...read, content: { ...content, schemaVersion: "comparison/1" } }]) {
    assert.equal(parseChangeProposalReferenceRead(value), null);
  }
  for (const key of Object.keys(read)) { const value: Record<string, unknown> = { ...read }; delete value[key]; assert.equal(parseChangeProposalReferenceRead(value), null); }
});
