import assert from "node:assert/strict";
import test from "node:test";

import { createCandidateImportDryRunLedger } from "../../../lib/server/knowledge/import/candidate-import.ts";

const now = "2026-08-28T00:00:00.000Z";
const rows = [
  { externalId: "poi-001", name: "museum-a", aliases: ["museum-a"], cityCode: "city-ordinary", latitudeE6: 23123456, longitudeE6: 113123456 },
  { externalId: "poi-002", name: "museum-b", aliases: ["museum-b"], cityCode: "city-popular", latitudeE6: 23123457, longitudeE6: 113123457 },
] as const;
const manifest = { format: "jsonl", encoding: "utf-8", sourceId: "licensed-source-v1", sourceHash: "sha256-manifest-001", licenceReceiptId: "policy-receipt-001" } as const;

test("RL-08 dry-runs licensed JSONL rows into bounded private candidates without Canonical IDs", () => {
  const ledger = createCandidateImportDryRunLedger();
  const result = ledger.dryRun({ now, actorId: "importer-001", manifest, rows });

  assert.equal(result.kind, "dry-run");
  assert.equal(result.disposition, "prepared");
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].name, "museum-a");
  assert.ok(result.candidates.every((candidate) => candidate.visibility === "private" && !Object.hasOwn(candidate, "canonicalId")));
  assert.ok(result.candidates.filter((candidate) => candidate.cityCode === "city-ordinary").length <= 20);
  assert.ok(result.candidates.filter((candidate) => candidate.cityCode === "city-popular").length <= 20);
});

test("RL-08 same source and hash is a no-op while changed rows are a conflict", () => {
  const ledger = createCandidateImportDryRunLedger();
  ledger.dryRun({ now, actorId: "importer-001", manifest, rows });

  assert.equal(ledger.dryRun({ now, actorId: "importer-001", manifest, rows }).disposition, "no-op");
  assert.equal(ledger.dryRun({ now, actorId: "importer-001", manifest: { ...manifest, sourceHash: "sha256-manifest-002" }, rows }).disposition, "conflict");
});

test("RL-08 rejects model, Canonical-ID, unlicensed, malformed, or over-cap candidate import input", () => {
  const ledger = createCandidateImportDryRunLedger();
  assert.throws(() => ledger.dryRun({ now, actorId: "importer-001", manifest, rows, model: "forbidden" }), TypeError);
  assert.throws(() => ledger.dryRun({ now, actorId: "importer-001", manifest: { ...manifest, licenceReceiptId: "" }, rows }), TypeError);
  assert.throws(() => ledger.dryRun({ now, actorId: "importer-001", manifest, rows: [{ ...rows[0], canonicalId: "forbidden" }] }), TypeError);
  assert.throws(() => ledger.dryRun({ now, actorId: "importer-001", manifest, rows: Array.from({ length: 21 }, (_, index) => ({ ...rows[0], externalId: `poi-${String(index).padStart(3, "0")}` })) }), TypeError);
});

test("RL-08 rejects impossible calendar instants before source state changes", () => {
  const ledger = createCandidateImportDryRunLedger();
  assert.throws(() => ledger.dryRun({ now: "2026-02-30T00:00:00Z", actorId: "importer-001", manifest, rows }), TypeError);
  assert.equal(ledger.dryRun({ now, actorId: "importer-001", manifest, rows }).disposition, "prepared");
});

test("RL-08 rejects duplicate external IDs before recording the source manifest", () => {
  const ledger = createCandidateImportDryRunLedger();
  assert.throws(() => ledger.dryRun({ now, actorId: "importer-001", manifest, rows: [rows[0], { ...rows[0], aliases: ["museum-duplicate"] }] }), TypeError);
  assert.equal(ledger.dryRun({ now, actorId: "importer-001", manifest, rows }).disposition, "prepared");
});
