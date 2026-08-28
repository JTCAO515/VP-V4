import assert from "node:assert/strict";
import test from "node:test";
import { buildHybridEvidencePack } from "../../lib/server/knowledge/retrieval/hybrid/index.ts";

const profile = { modelId: "fixture-embedding-v1", region: "none", dimensions: 8, indexVersion: "fixture-index-v1" };
const locales = ["zh", "en", "es", "ru", "ar"] as const;

test("reports five opaque locale fixtures and an honest no-evidence result", () => {
  const result = buildHybridEvidencePack({
    now: "2026-08-28T00:00:00.000Z",
    profile,
    rrfK: 60,
    units: locales.map((locale) => ({
      id: `unit-${locale}`,
      targetId: `target-${locale}`,
      fact: { id: `fact-${locale}`, status: "reviewed" as const, expiresAt: "2026-12-01T00:00:00.000Z", licenceAllowed: true },
    })),
    lexical: locales.map((locale, index) => ({ unitId: `unit-${locale}`, rank: index + 1, exact: true })),
    vector: [],
  });

  assert.equal(result.kind, "evidence_pack");
  if (result.kind !== "evidence_pack") return;
  assert.deepEqual(result.items.map((item) => item.retrievalUnitId), locales.map((locale) => `unit-${locale}`));

  const noEvidence = buildHybridEvidencePack({
    now: "2026-08-28T00:00:00.000Z",
    profile,
    rrfK: 60,
    units: [{ id: "unit-draft", targetId: "target-draft", fact: { id: "fact-draft", status: "draft", expiresAt: "2026-12-01T00:00:00.000Z", licenceAllowed: true } }],
    lexical: [{ unitId: "unit-draft", rank: 1, exact: true }],
    vector: [],
  });
  assert.deepEqual(noEvidence, { kind: "no_eligible_evidence", profile });
});
