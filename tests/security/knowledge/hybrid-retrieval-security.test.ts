import assert from "node:assert/strict";
import test from "node:test";
import { buildHybridEvidencePack } from "../../../lib/server/knowledge/retrieval/hybrid/index.ts";

const profile = { modelId: "fixture-embedding-v1", region: "none", dimensions: 8, indexVersion: "fixture-index-v1" };
const now = "2026-08-28T00:00:00.000Z";

test("RL-02 denies six ineligible or unknown retrieval fixtures before ranking", () => {
  const result = buildHybridEvidencePack({
    now,
    profile,
    rrfK: 60,
    units: [
      { id: "candidate", targetId: "poi-1", fact: { id: "fact-1", status: "candidate", expiresAt: "2026-12-01T00:00:00.000Z", licenceAllowed: true } },
      { id: "draft", targetId: "poi-2", fact: { id: "fact-2", status: "draft", expiresAt: "2026-12-01T00:00:00.000Z", licenceAllowed: true } },
      { id: "deprecated", targetId: "poi-3", fact: { id: "fact-3", status: "deprecated", expiresAt: "2026-12-01T00:00:00.000Z", licenceAllowed: true } },
      { id: "expired", targetId: "poi-4", fact: { id: "fact-4", status: "reviewed", expiresAt: "2026-08-27T23:59:59.000Z", licenceAllowed: true } },
      { id: "licence-blocked", targetId: "poi-5", fact: { id: "fact-5", status: "reviewed", expiresAt: "2026-12-01T00:00:00.000Z", licenceAllowed: false } },
    ],
    lexical: [
      { unitId: "candidate", rank: 1, exact: true },
      { unitId: "draft", rank: 2, exact: true },
      { unitId: "deprecated", rank: 3, exact: true },
      { unitId: "expired", rank: 4, exact: true },
      { unitId: "licence-blocked", rank: 5, exact: true },
      { unitId: "unknown", rank: 6, exact: true },
    ],
    vector: [],
  });

  assert.deepEqual(result, { kind: "no_eligible_evidence", profile });
});
