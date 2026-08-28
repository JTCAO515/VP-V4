import assert from "node:assert/strict";
import test from "node:test";
import { buildHybridEvidencePack } from "../../../lib/server/knowledge/retrieval/hybrid/index.ts";

const profile = {
  modelId: "fixture-embedding-v1",
  region: "none",
  dimensions: 8,
  indexVersion: "fixture-index-v1",
};

test("keeps an eligible exact hit ahead of a higher ranked vector-only hit", () => {
  const result = buildHybridEvidencePack({
    now: "2026-08-28T00:00:00.000Z",
    profile,
    rrfK: 60,
    units: [
      {
        id: "unit-exact",
        targetId: "poi-a",
        fact: { id: "fact-exact", status: "reviewed", expiresAt: "2026-12-01T00:00:00.000Z", licenceAllowed: true },
      },
      {
        id: "unit-vector",
        targetId: "poi-b",
        fact: { id: "fact-vector", status: "reviewed", expiresAt: "2026-12-01T00:00:00.000Z", licenceAllowed: true },
      },
    ],
    lexical: [{ unitId: "unit-exact", rank: 2, exact: true }],
    vector: [
      { unitId: "unit-vector", rank: 1 },
      { unitId: "unit-exact", rank: 50 },
    ],
  });

  assert.deepEqual(result, {
    kind: "evidence_pack",
    profile,
    items: [
      { retrievalUnitId: "unit-exact", targetId: "poi-a", factId: "fact-exact", lexicalRank: 2, vectorRank: 50, fusedScore: 1 / 62 + 1 / 110 },
      { retrievalUnitId: "unit-vector", targetId: "poi-b", factId: "fact-vector", vectorRank: 1, fusedScore: 1 / 61 },
    ],
  });
});
