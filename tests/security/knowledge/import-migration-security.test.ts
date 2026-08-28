import assert from "node:assert/strict";
import test from "node:test";

import { createKnowledgeImportLedger } from "../../../lib/server/knowledge/import/migration.ts";

const now = "2026-08-28T00:00:00.000Z";
const source = { sourceId: "legacy-source-v1", rowId: "row-001", rowHash: "sha256-fixture-001", sourceVersion: "legacy-b5ef081" };

test("RL-08 imports a replayed source row only as a private candidate", () => {
  const ledger = createKnowledgeImportLedger();
  const result = ledger.prepareImport({ now, actorId: "author-001", source, candidateId: "candidate-001" });

  assert.equal(result.kind, "prepared");
  assert.equal(result.candidate.status, "candidate");
  assert.equal(result.candidate.visibility, "private");
  assert.equal(result.candidate.source.rowHash, source.rowHash);
});

test("RL-08 rejects source replay drift before it can create a second candidate", () => {
  const ledger = createKnowledgeImportLedger();
  ledger.prepareImport({ now, actorId: "author-001", source, candidateId: "candidate-001" });

  assert.throws(() => ledger.prepareImport({ now, actorId: "author-001", source: { ...source, rowHash: "sha256-drift-002" }, candidateId: "candidate-002" }), TypeError);
});

test("RL-08 rejects an exact source replay under a different Candidate ID", () => {
  const ledger = createKnowledgeImportLedger();
  ledger.prepareImport({ now, actorId: "author-001", source, candidateId: "candidate-001" });

  assert.throws(() => ledger.prepareImport({ now, actorId: "author-001", source, candidateId: "candidate-002" }), TypeError);
});

test("RL-08 rejects non-RFC3339 and impossible calendar instants before import", () => {
  const ledger = createKnowledgeImportLedger();

  assert.throws(() => ledger.prepareImport({ now: "2026-08-28 00:00:00Z", actorId: "author-001", source, candidateId: "candidate-001" }), TypeError);
  assert.throws(() => ledger.prepareImport({ now: "2026-02-30T00:00:00Z", actorId: "author-001", source, candidateId: "candidate-001" }), TypeError);
});

test("RL-08 denies self-review and stale Change Set CAS without publishing a Fact", () => {
  const ledger = createKnowledgeImportLedger();
  const prepared = ledger.prepareImport({ now, actorId: "author-001", source, candidateId: "candidate-001" });
  const change = ledger.createChangeSet({ now, actorId: "author-001", candidateId: prepared.candidate.id, expectedRevision: prepared.candidate.revision });

  assert.throws(() => ledger.reviewAndPublish({ now, actorId: "author-001", changeSetId: change.id, expectedRevision: change.revision, decision: "approve" }), TypeError);
  assert.throws(() => ledger.reviewAndPublish({ now, actorId: "reviewer-002", changeSetId: change.id, expectedRevision: change.revision + 1, decision: "approve" }), TypeError);
  assert.deepEqual(ledger.publicFacts(), []);
});

test("an independent current reviewer records one reviewed Fact with an eligibility event and audit, without a public projection", () => {
  const ledger = createKnowledgeImportLedger();
  const prepared = ledger.prepareImport({ now, actorId: "author-001", source, candidateId: "candidate-001" });
  const change = ledger.createChangeSet({ now, actorId: "author-001", candidateId: prepared.candidate.id, expectedRevision: prepared.candidate.revision });
  const published = ledger.reviewAndPublish({ now, actorId: "reviewer-002", changeSetId: change.id, expectedRevision: change.revision, decision: "approve" });

  assert.equal(published.kind, "published");
  assert.equal(published.fact.status, "reviewed");
  assert.equal(published.eligibilityEvent.kind, "eligibility_recheck_required");
  assert.equal(published.audit.actorId, "reviewer-002");
  assert.deepEqual(ledger.reviewedFacts().map((fact) => fact.id), [published.fact.id]);
  assert.deepEqual(ledger.publicFacts(), []);
});

test("records explicit merge, split, tombstone, and source-delete outcomes as private audit events", () => {
  const ledger = createKnowledgeImportLedger();
  const prepared = ledger.prepareImport({ now, actorId: "author-001", source, candidateId: "candidate-001" });
  const outcomes = ["merge", "split", "tombstone", "source_delete"] as const;
  for (const outcome of outcomes) ledger.recordSourceDisposition({ now, actorId: "author-001", candidateId: prepared.candidate.id, outcome });

  assert.deepEqual(ledger.audit().map((event) => event.outcome), outcomes);
  assert.deepEqual(ledger.publicFacts(), []);
});
