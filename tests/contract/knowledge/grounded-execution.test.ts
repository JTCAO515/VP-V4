import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { EvidenceReceipt, GroundedClaim } from "../../../lib/server/contracts/index.ts";
import { GroundedExecutionCard } from "../../../components/chat/cards/GroundedExecutionCard.ts";
import { prepareGroundedExecution } from "../../../lib/server/knowledge/claim/grounded-execution.ts";

const now = "2026-08-28T00:00:00.000Z";
const factReceipt: EvidenceReceipt = {
  kind: "fact",
  factId: "fact-ticket-price",
  version: 3,
  reviewedAt: "2026-08-27T00:00:00.000Z",
  expiresAt: "2026-12-01T00:00:00.000Z",
};
const moneyClaim: GroundedClaim = {
  claimType: "money",
  subjectId: "poi-ticket-office",
  value: { amountMinor: 6000, currency: "CNY" },
  asOf: "2026-08-27T00:00:00.000Z",
  evidence: [factReceipt],
};

test("builds an evidence-exact deterministic card from typed execution claims", () => {
  const outcome = prepareGroundedExecution({
    mode: "grounded_execution",
    now,
    cardId: "ticket-card",
    claims: [{ claim: moneyClaim, qualifiers: [{ kind: "condition", code: "reservation_required" }] }],
  });

  assert.equal(outcome.kind, "execution_card");
  if (outcome.kind !== "execution_card") throw new Error("expected an execution card");
  assert.deepEqual(outcome.card.evidence, [factReceipt]);
  assert.deepEqual(outcome.rows.map((row) => row.claim.claimType), ["money"]);
  assert.equal(Object.isFrozen(outcome), true);

  const markup = renderToStaticMarkup(createElement(GroundedExecutionCard, { locale: "en", outcome }));
  assert.match(markup, /Verified execution details/);
  assert.match(markup, /CNY 60\.00/);
  assert.match(markup, /Reservation required/);
  assert.doesNotMatch(markup, /model explanation/i);
});

test("keeps low-risk explanations outside the execution-card channel", () => {
  assert.deepEqual(prepareGroundedExecution({ mode: "low_risk_explanation" }), {
    kind: "low_risk_explanation",
    card: null,
  });
});
