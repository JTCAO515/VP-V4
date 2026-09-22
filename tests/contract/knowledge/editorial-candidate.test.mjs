import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { prepareCandidate } from "../../../scripts/knowledge-prepare-candidate.mjs";
import { isKnowledgeOperation } from "../../../lib/server/knowledge/publication/statement.ts";

const batchPath = new URL("../../../docs/knowledge-base/batches/2026-09-12-first-party/statements.json", import.meta.url);
const batch = JSON.parse(readFileSync(batchPath, "utf8"));
const clone = () => structuredClone(batch);

test("airport supplement is submit-compatible but cannot count as reviewed coverage", () => {
  const airport = JSON.parse(readFileSync(new URL("../../../docs/knowledge-base/batches/2026-09-22-airport-transport/statements.json", import.meta.url), "utf8"));
  const record = airport.records[0];
  const operation = prepareCandidate(airport, record.editorialId);
  assert.ok(isKnowledgeOperation(operation));
  assert.deepEqual(operation.statement, record.statement);
  assert.deepEqual(operation.statement.scope.cities, ["shanghai"]);
  assert.equal(operation.statement.scope.scene, "airport_transport");
  assert.equal(record.lifecycle.reviewed, false);
  assert.equal(record.lifecycle.published, false);
  assert.equal(record.lifecycle.reviewer, null);
  const matrix = JSON.parse(readFileSync(new URL("../../../docs/knowledge-base/batches/2026-09-12-first-party/supported-journey-matrix.json", import.meta.url), "utf8"));
  assert.ok(matrix.candidateSupplements.some(cell => cell.editorialIds.includes(record.editorialId)));
  assert.ok(!matrix.supportedCells.some(cell => cell.editorialIds.includes(record.editorialId)));
  assert.ok(matrix.explicitGaps.some(cell => cell.scenario === "airport_ground_transport" && cell.cities.includes("shanghai")));
});

test("editorial preparation preserves the exact bilingual statement and emits only the existing submit contract", () => {
  for (const record of batch.records) {
    const operation = prepareCandidate(batch, record.editorialId);
    assert.ok(isKnowledgeOperation(operation));
    assert.equal(operation.action, "submit_statement");
    assert.deepEqual(operation.statement, record.statement);
    assert.deepEqual(Object.keys(operation).sort(), ["action", "candidateId", "operationId", "statement", "title"]);
  }
});

test("ambiguous selection and invalid or mismatched bilingual content fail before export", () => {
  assert.throws(() => prepareCandidate(batch, "missing"), /not found/);
  const duplicate = clone(); duplicate.records.push(duplicate.records[0]); duplicate.recordCount++;
  assert.throws(() => prepareCandidate(duplicate, "ARR-01"), /duplicate/);
  const invalid = clone(); invalid.records[0].statement.expressions.en.conditions.pop();
  assert.throws(() => prepareCandidate(invalid, "ARR-01"), /valid Ops/);
  const extra = clone(); extra.records[0].statement.reviewed = true;
  assert.throws(() => prepareCandidate(extra, "ARR-01"), /valid Ops/);
  const count = clone(); count.recordCount++;
  assert.throws(() => prepareCandidate(count, "ARR-01"), /Invalid/);
});

test("CLI creates an API-compatible file and refuses overwrite so retry IDs remain stable", () => {
  const directory = mkdtempSync(join(tmpdir(), "vpj15-candidate-"));
  try {
    const output = join(directory, "candidate.json");
    const args = ["--experimental-strip-types", "scripts/knowledge-prepare-candidate.mjs", fileURLToPath(batchPath), "ARR-01", output];
    execFileSync(process.execPath, args);
    const original = readFileSync(output, "utf8");
    assert.ok(isKnowledgeOperation(JSON.parse(original)));
    assert.equal(spawnSync(process.execPath, args).status, 1);
    assert.equal(readFileSync(output, "utf8"), original);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
