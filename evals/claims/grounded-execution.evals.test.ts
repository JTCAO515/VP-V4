import assert from "node:assert/strict";
import test from "node:test";

import type { EvidenceReceipt, GroundedClaim } from "../../lib/server/contracts/index.ts";
import { prepareGroundedExecution } from "../../lib/server/knowledge/claim/grounded-execution.ts";

const receipt: EvidenceReceipt = {
  kind: "fact",
  factId: "fact-card",
  version: 2,
  reviewedAt: "2026-08-27T00:00:00.000Z",
  expiresAt: "2026-12-01T00:00:00.000Z",
};

test("reports deterministic claim ordering and an honest no-evidence outcome", () => {
  const claim = (claimType: GroundedClaim["claimType"], subjectId: string): GroundedClaim =>
    claimType === "money"
      ? { claimType, subjectId, value: { amountMinor: 50, currency: "CNY" }, asOf: "2026-08-27T00:00:00.000Z", evidence: [receipt] }
      : { claimType: "address", subjectId, value: { lines: ["1 Example Road"], countryCode: "CN" }, asOf: "2026-08-27T00:00:00.000Z", evidence: [receipt] };
  const ordered = prepareGroundedExecution({
    mode: "grounded_execution",
    now: "2026-08-28T00:00:00.000Z",
    cardId: "ordered",
    claims: [{ claim: claim("money", "z-subject"), qualifiers: [] }, { claim: claim("address", "a-subject"), qualifiers: [] }],
  });
  assert.equal(ordered.kind, "execution_card");
  if (ordered.kind !== "execution_card") throw new Error("expected deterministic card");
  assert.deepEqual(ordered.rows.map((row) => `${row.claim.claimType}:${row.claim.subjectId}`), ["address:a-subject", "money:z-subject"]);

  assert.deepEqual(
    prepareGroundedExecution({ mode: "grounded_execution", now: "2026-08-28T00:00:00.000Z", cardId: "empty", claims: [] }),
    { kind: "unsupported_execution", reason: "NO_ELIGIBLE_EVIDENCE", card: null, rows: [] },
  );
});

test("orders opaque subject identifiers by stable code point rather than host locale", () => {
  const evidence = [receipt];
  const claim = (subjectId: string): GroundedClaim => ({
    claimType: "money",
    subjectId,
    value: { amountMinor: 50, currency: "CNY" },
    asOf: "2026-08-27T00:00:00.000Z",
    evidence,
  });
  const outcome = prepareGroundedExecution({
    mode: "grounded_execution",
    now: "2026-08-28T00:00:00.000Z",
    cardId: "code-point-order",
    claims: [{ claim: claim("z-subject"), qualifiers: [] }, { claim: claim("ä-subject"), qualifiers: [] }],
  });

  assert.equal(outcome.kind, "execution_card");
  if (outcome.kind !== "execution_card") throw new Error("expected deterministic card");
  assert.deepEqual(outcome.rows.map((row) => row.claim.subjectId), ["z-subject", "ä-subject"]);
});
