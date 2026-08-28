import assert from "node:assert/strict";
import test from "node:test";

import { evaluateFeasibility, scoreFinalState, type ConstraintSet, type TravelPlan } from "../../lib/server/constraints/index.ts";

type SyntheticRoutePattern = Readonly<{
  id: string;
  cityId: string;
  poiIds: readonly string[];
  typicalOrder: readonly string[];
  durationRangeMinutes: readonly [number, number];
  transferProfile: "unknown" | "walkable";
  applicability: Readonly<{ season: "shoulder"; pace: "steady"; partySize: number }>;
  sourceClass: "self-authored-synthetic";
  runtimeEligible: false;
}>;

const pattern: SyntheticRoutePattern = {
  id: "synthetic-westlake-morning",
  cityId: "synthetic-city",
  poiIds: ["stop-a", "stop-b"],
  typicalOrder: ["stop-a", "stop-b"],
  durationRangeMinutes: [120, 240],
  transferProfile: "unknown",
  applicability: { season: "shoulder", pace: "steady", partySize: 2 },
  sourceClass: "self-authored-synthetic",
  runtimeEligible: false,
};

const constraints: ConstraintSet = {
  revision: 1,
  partySize: 2,
  constraints: [
    { id: "opening", kind: "hard", type: "opening_required" },
    { id: "transfer", kind: "hard", type: "transfer_evidence_required" },
    { id: "minimum-transfer", kind: "hard", type: "min_transfer_minutes", minutes: 30 },
  ],
};

function candidatePlan(overrides: Partial<TravelPlan> = {}): TravelPlan {
  return {
    currency: "CNY",
    totalCostMinor: 0,
    priceEvidence: "current",
    stops: [
      { id: "stop-a", startsAt: "2026-09-01T09:00:00.000Z", endsAt: "2026-09-01T10:00:00.000Z", opening: "open", openingEvidence: "current", reservation: "not_required", reservationEvidence: "current" },
      { id: "stop-b", startsAt: "2026-09-01T10:45:00.000Z", endsAt: "2026-09-01T12:00:00.000Z", opening: "open", openingEvidence: "current", reservation: "not_required", reservationEvidence: "current" },
    ],
    transfers: [{ fromStopId: "stop-a", toStopId: "stop-b", minutes: 45, evidence: "unknown" }],
    ...overrides,
  };
}

function projectRoutePattern(routePattern: SyntheticRoutePattern, plan: TravelPlan): TravelPlan {
  const stopsById = new Map(plan.stops.map((stop) => [stop.id, stop]));
  const stops = routePattern.typicalOrder.map((poiId) => {
    const stop = stopsById.get(poiId);
    if (!stop) throw new Error(`RoutePattern ${routePattern.id} references a missing canonical POI.`);
    return stop;
  });
  if (stops.length !== plan.stops.length) throw new Error("RoutePattern must cover the whole projected candidate plan.");

  return { ...plan, stops };
}

test("V4-05 route-pattern order cannot replace current route-matrix evidence", () => {
  assert.deepEqual(pattern.typicalOrder, ["stop-a", "stop-b"]);
  const projected = projectRoutePattern(pattern, candidatePlan());
  const result = evaluateFeasibility({ constraints, plan: projected });

  assert.deepEqual(projected.stops.map(({ id }) => id), pattern.typicalOrder);
  assert.equal(result.status, "unknown");
  assert.equal(scoreFinalState(result), "needs_evidence");
  assert.deepEqual(result.missingEvidence.map(({ code }) => code), ["TRANSFER_EVIDENCE_REQUIRED", "TRANSFER_EVIDENCE_REQUIRED"]);
  assert.equal(projected.transfers[0].evidence, "unknown");
  assert.equal(pattern.runtimeEligible, false);
});

test("V4-05 route-pattern order cannot replace a current closed Fact", () => {
  const plan = candidatePlan({
    transfers: [{ fromStopId: "stop-a", toStopId: "stop-b", minutes: 45, evidence: "current" }],
    stops: [
      { id: "stop-a", startsAt: "2026-09-01T09:00:00.000Z", endsAt: "2026-09-01T10:00:00.000Z", opening: "closed", openingEvidence: "current", reservation: "not_required", reservationEvidence: "current" },
      { id: "stop-b", startsAt: "2026-09-01T10:45:00.000Z", endsAt: "2026-09-01T12:00:00.000Z", opening: "open", openingEvidence: "current", reservation: "not_required", reservationEvidence: "current" },
    ],
  });
  const result = evaluateFeasibility({ constraints, plan: projectRoutePattern(pattern, plan) });

  assert.equal(result.status, "infeasible");
  assert.equal(scoreFinalState(result), "reject");
  assert.deepEqual(result.violations, [{ constraintId: "opening", code: "STOP_CLOSED" }]);
});

test("V4-05 synthetic paired spike reports no adoption gain", () => {
  const baseline = evaluateFeasibility({ constraints, plan: candidatePlan() });
  const routePatternCandidate = evaluateFeasibility({ constraints, plan: projectRoutePattern(pattern, candidatePlan()) });

  assert.equal(scoreFinalState(baseline), "needs_evidence");
  assert.equal(scoreFinalState(routePatternCandidate), "needs_evidence");
  assert.equal(pattern.sourceClass, "self-authored-synthetic");
  assert.equal(pattern.runtimeEligible, false);
});
