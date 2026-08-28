import assert from "node:assert/strict";
import test from "node:test";

import type { EvidenceReceipt, GroundedClaim } from "../../../lib/server/contracts/index.ts";
import { prepareGroundedExecution } from "../../../lib/server/knowledge/claim/grounded-execution.ts";

const now = "2026-08-28T00:00:00.000Z";
const baseReceipt: EvidenceReceipt = {
  kind: "fact",
  factId: "fact-entry",
  version: 1,
  reviewedAt: "2026-08-27T00:00:00.000Z",
  expiresAt: "2026-12-01T00:00:00.000Z",
};
const baseClaim: GroundedClaim = {
  claimType: "admission",
  subjectId: "poi-entry",
  value: { action: "reserve" },
  asOf: "2026-08-27T00:00:00.000Z",
  evidence: [baseReceipt],
};

test("RL-04 returns no executable card for stale, negative, or unsupported high-risk claims", () => {
  const outcomes = [
    prepareGroundedExecution({
      mode: "grounded_execution",
      now,
      cardId: "stale",
      claims: [{ claim: { ...baseClaim, evidence: [{ ...baseReceipt, expiresAt: "2026-08-27T23:59:59.000Z" }] }, qualifiers: [] }],
    }),
    prepareGroundedExecution({
      mode: "grounded_execution",
      now,
      cardId: "negative",
      claims: [{ claim: baseClaim, qualifiers: [{ kind: "negative_evidence", code: "not_available" }] }],
    }),
    prepareGroundedExecution({
      mode: "grounded_execution",
      now,
      cardId: "forged",
      claims: [{ claim: { ...baseClaim, claimType: "invented_execution" } as unknown as GroundedClaim, qualifiers: [] }],
    }),
  ];

  assert.deepEqual(outcomes.map((outcome) => outcome.kind), ["unsupported_execution", "unsupported_execution", "unsupported_execution"]);
  assert.deepEqual(outcomes.map((outcome) => outcome.card), [null, null, null]);
  assert.deepEqual(outcomes.map((outcome) => (outcome.kind === "low_risk_explanation" ? 0 : outcome.rows.length)), [0, 0, 0]);
});

test("rejects raw explanation fields before a result exists", () => {
  assert.throws(
    () => prepareGroundedExecution({ mode: "low_risk_explanation", explanation: "untrusted model prose" } as never),
    TypeError,
  );
});

test("rejects forged discriminated values and invalid time-window instants before rendering", () => {
  const injectedPayment = {
    claimType: "payment_method",
    subjectId: "poi-pay",
    value: { method: "INJECTED_MODEL_TEXT" },
    asOf: "2026-08-27T00:00:00.000Z",
    evidence: [baseReceipt],
  } as unknown as GroundedClaim;
  const invalidWindow = {
    claimType: "time_window",
    subjectId: "poi-window",
    value: { startsAt: "2026-02-30T00:00:00.000Z", timeZone: "Asia/Shanghai" },
    asOf: "2026-08-27T00:00:00.000Z",
    evidence: [baseReceipt],
  } as unknown as GroundedClaim;

  for (const claim of [injectedPayment, invalidWindow]) {
    assert.throws(
      () => prepareGroundedExecution({ mode: "grounded_execution", now, cardId: "forged-value", claims: [{ claim, qualifiers: [] }] }),
      TypeError,
    );
  }
});
