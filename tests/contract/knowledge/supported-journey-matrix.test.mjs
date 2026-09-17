import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isKnowledgeStatement } from "../../../lib/server/knowledge/publication/statement.ts";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const batch = read("../../../docs/knowledge-base/batches/2026-09-12-first-party/statements.json");
const matrix = read("../../../docs/knowledge-base/batches/2026-09-12-first-party/supported-journey-matrix.json");
const byId = new Map(batch.records.map((record) => [record.editorialId, record]));

test("Supported Journey Matrix is bounded to the existing statement batch and preserves its city/scene scope", () => {
  assert.equal(matrix.schemaVersion, "supported-journey-matrix/1");
  assert.equal(matrix.status, "development_evidence_only");
  const selected = matrix.supportedCells.flatMap((cell) => cell.editorialIds);
  assert.equal(selected.length, 13);
  assert.equal(new Set(selected).size, selected.length);
  assert.deepEqual([...selected].sort(), [...byId.keys()].sort());
  for (const cell of matrix.supportedCells) {
    assert.ok(["staging_observed_then_reader_disabled", "source_revalidated_prepublication"].includes(cell.evidenceState));
    for (const id of cell.editorialIds) {
      const record = byId.get(id);
      assert.ok(record, id);
      assert.equal(record.statement.scope.scene, cell.scene, id);
      assert.deepEqual(record.statement.scope.cities, cell.cities, id);
    }
  }
});

test("Supported Journey Matrix keeps research candidates and unsupported coverage explicit", () => {
  const arrival = byId.get("ARR-01");
  assert.ok(arrival);
  assert.equal(arrival.parent, "N-01");
  assert.equal(arrival.sourceObservedAt, "2026-09-17");
  assert.equal(arrival.statement.scope.scene, "arrival");
  assert.ok(isKnowledgeStatement(arrival.statement));
  assert.ok(matrix.supportedCells.some((cell) => cell.editorialIds.includes("ARR-01") && cell.evidenceState === "source_revalidated_prepublication"));
  for (const gap of matrix.explicitGaps) {
    assert.ok(gap.reason.length > 0);
    for (const id of gap.researchCandidateIds) assert.ok(!byId.has(id), `${id} cannot be inferred as a statement`);
  }
  assert.deepEqual(matrix.publicationBoundary.prohibitedInferences, ["nationwide coverage", "on-site availability", "licence verification", "production release", "Ask grounding"]);
});
