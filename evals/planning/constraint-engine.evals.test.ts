import assert from "node:assert/strict";
import test from "node:test";

import { evaluateFeasibility, scoreFinalState, type ConstraintSet, type TravelPlan } from "../../lib/server/constraints/index.ts";

const plan: TravelPlan = {
  currency: "CNY", totalCostMinor: 28_000, priceEvidence: "current",
  stops: [
    { id: "stop-a", startsAt: "2026-09-01T09:00:00.000Z", endsAt: "2026-09-01T10:00:00.000Z", opening: "open", openingEvidence: "current", reservation: "not_required", reservationEvidence: "current" },
    { id: "stop-b", startsAt: "2026-09-01T10:45:00.000Z", endsAt: "2026-09-01T12:00:00.000Z", opening: "open", openingEvidence: "current", reservation: "available", reservationEvidence: "current" },
  ],
  transfers: [{ fromStopId: "stop-a", toStopId: "stop-b", minutes: 45, evidence: "current" }],
};

const cases: readonly Readonly<{ name: string; constraints: ConstraintSet; plan: TravelPlan; status: "feasible" | "infeasible" | "unknown"; finalState: "accept" | "reject" | "needs_evidence" }>[] = [
  { name: "bounded open itinerary", constraints: { revision: 1, partySize: 2, constraints: [{ id: "budget", kind: "hard", type: "max_budget", amountMinor: 30_000, currency: "CNY" }, { id: "transfer", kind: "hard", type: "min_transfer_minutes", minutes: 30 }, { id: "opening", kind: "hard", type: "opening_required" }] }, plan, status: "feasible", finalState: "accept" },
  { name: "over-budget itinerary", constraints: { revision: 1, partySize: 2, constraints: [{ id: "budget", kind: "hard", type: "max_budget", amountMinor: 20_000, currency: "CNY" }] }, plan, status: "infeasible", finalState: "reject" },
  { name: "unverified opening itinerary", constraints: { revision: 1, partySize: 2, constraints: [{ id: "opening", kind: "hard", type: "opening_required" }] }, plan: { ...plan, stops: [{ ...plan.stops[0], opening: "unknown" }, plan.stops[1]] }, status: "unknown", finalState: "needs_evidence" },
];

test("V4-04 PlanConstraintEval preserves deterministic final-state decisions", () => {
  for (const scenario of cases) {
    const result = evaluateFeasibility({ constraints: scenario.constraints, plan: scenario.plan });
    assert.equal(result.status, scenario.status, scenario.name);
    assert.equal(scoreFinalState(result), scenario.finalState, scenario.name);
  }
});
