import assert from "node:assert/strict";
import test from "node:test";

import { ConstraintEngineError, evaluateFeasibility, scoreFinalState, type ConstraintSet, type TravelPlan } from "../../../lib/server/constraints/index.ts";

const basePlan: TravelPlan = {
  currency: "CNY",
  totalCostMinor: 36_000,
  priceEvidence: "current",
  stops: [
    { id: "bund", startsAt: "2026-09-01T09:00:00.000Z", endsAt: "2026-09-01T10:00:00.000Z", opening: "open", openingEvidence: "current", reservation: "not_required", reservationEvidence: "current" },
    { id: "museum", startsAt: "2026-09-01T10:30:00.000Z", endsAt: "2026-09-01T12:00:00.000Z", opening: "open", openingEvidence: "current", reservation: "available", reservationEvidence: "current" },
  ],
  transfers: [{ fromStopId: "bund", toStopId: "museum", minutes: 30, evidence: "current" }],
};

const constraintSet = (constraints: ConstraintSet["constraints"]): ConstraintSet => ({ revision: 1, partySize: 2, constraints });

test("hard budget violations are deterministically infeasible while soft preferences create stable tradeoffs", () => {
  const result = evaluateFeasibility({
    constraints: constraintSet([
      { id: "budget", kind: "hard", type: "max_budget", amountMinor: 30_000, currency: "CNY" },
      { id: "pace", kind: "soft", type: "max_stops", count: 1, weight: 2 },
    ]),
    plan: basePlan,
  });

  assert.equal(result.status, "infeasible");
  assert.deepEqual(result.violations.map((violation) => violation.constraintId), ["budget"]);
  assert.deepEqual(result.tradeoffs.map((tradeoff) => tradeoff.constraintId), ["pace"]);
  assert.equal(scoreFinalState(result), "reject");
});

test("time windows and transfers are code-decided hard constraints", () => {
  const result = evaluateFeasibility({
    constraints: constraintSet([
      { id: "window", kind: "hard", type: "arrival_window", startsAt: "2026-09-01T08:00:00.000Z", endsAt: "2026-09-01T08:45:00.000Z" },
      { id: "transfer", kind: "hard", type: "min_transfer_minutes", minutes: 45 },
    ]),
    plan: basePlan,
  });

  assert.equal(result.status, "infeasible");
  assert.deepEqual(result.violations.map((violation) => violation.constraintId), ["transfer", "window"]);
});

test("a route-matrix duration cannot hide overlapping or too-short scheduled transfers", () => {
  const result = evaluateFeasibility({
    constraints: constraintSet([{ id: "transfer", kind: "hard", type: "min_transfer_minutes", minutes: 30 }]),
    plan: { ...basePlan, stops: [basePlan.stops[0], { ...basePlan.stops[1], startsAt: "2026-09-01T10:15:00.000Z" }] },
  });
  assert.equal(result.status, "infeasible");
  assert.equal(result.violations[0]?.code, "TRANSFER_TOO_SHORT");
});

test("closed places are infeasible and unknown opening, route, or reservation evidence remains visible", () => {
  const closed = evaluateFeasibility({ constraints: constraintSet([{ id: "opening", kind: "hard", type: "opening_required" }]), plan: { ...basePlan, stops: [{ ...basePlan.stops[0], opening: "closed" }], transfers: [] } });
  assert.equal(closed.status, "infeasible");
  assert.equal(closed.violations[0]?.constraintId, "opening");

  const unknown = evaluateFeasibility({
    constraints: constraintSet([
      { id: "opening", kind: "hard", type: "opening_required" },
      { id: "reservation", kind: "hard", type: "reservation_required" },
      { id: "route", kind: "hard", type: "transfer_evidence_required" },
    ]),
    plan: { ...basePlan, stops: [{ ...basePlan.stops[0], opening: "unknown", reservation: "unknown" }, basePlan.stops[1]], transfers: [] },
  });
  assert.equal(unknown.status, "unknown");
  assert.deepEqual(unknown.missingEvidence.map((need) => need.constraintId), ["opening", "reservation", "route"]);
  assert.equal(scoreFinalState(unknown), "needs_evidence");
});

test("unknown or expired price evidence cannot be silently treated as a verified budget", () => {
  const result = evaluateFeasibility({
    constraints: constraintSet([{ id: "budget", kind: "hard", type: "max_budget", amountMinor: 30_000, currency: "CNY" }]),
    plan: { ...basePlan, priceEvidence: "unknown" },
  });
  assert.equal(result.status, "unknown");
  assert.deepEqual(result.missingEvidence, [{ constraintId: "budget", code: "PRICE_EVIDENCE_REQUIRED" }]);
});

test("uses RFC3339 instants rather than lexical timestamp ordering", () => {
  const result = evaluateFeasibility({
    constraints: constraintSet([{ id: "window", kind: "hard", type: "arrival_window", startsAt: "2026-09-01T08:00:00.000Z", endsAt: "2026-09-01T09:00:00.000Z" }]),
    plan: { ...basePlan, stops: [{ ...basePlan.stops[0], startsAt: "2026-09-01T08:30:00.000-09:00", endsAt: "2026-09-01T10:00:00.000-09:00" }, { ...basePlan.stops[1], startsAt: "2026-09-01T20:00:00.000Z", endsAt: "2026-09-01T21:00:00.000Z" }], transfers: [{ fromStopId: "bund", toStopId: "museum", minutes: 60, evidence: "current" }] },
  });
  assert.equal(result.status, "infeasible");
  assert.equal(result.violations[0]?.code, "ARRIVAL_WINDOW_VIOLATED");
});

test("requires current route evidence for every adjacent stop pair", () => {
  const thirdStop = { id: "park", startsAt: "2026-09-01T13:00:00.000Z", endsAt: "2026-09-01T14:00:00.000Z", opening: "open" as const, openingEvidence: "current" as const, reservation: "not_required" as const, reservationEvidence: "current" as const };
  const result = evaluateFeasibility({
    constraints: constraintSet([{ id: "transfer", kind: "hard", type: "min_transfer_minutes", minutes: 15 }]),
    plan: { ...basePlan, stops: [...basePlan.stops, thirdStop] },
  });
  assert.equal(result.status, "unknown");
  assert.deepEqual(result.missingEvidence, [{ constraintId: "transfer", code: "TRANSFER_EVIDENCE_REQUIRED" }]);
});

test("a missing route link cannot hide a proven short transfer", () => {
  const thirdStop = { id: "park", startsAt: "2026-09-01T13:00:00.000Z", endsAt: "2026-09-01T14:00:00.000Z", opening: "open" as const, openingEvidence: "current" as const, reservation: "not_required" as const, reservationEvidence: "current" as const };
  const result = evaluateFeasibility({
    constraints: constraintSet([{ id: "transfer", kind: "hard", type: "min_transfer_minutes", minutes: 45 }]),
    plan: { ...basePlan, stops: [...basePlan.stops, thirdStop] },
  });
  assert.equal(result.status, "infeasible");
  assert.deepEqual(result.violations, [{ constraintId: "transfer", code: "TRANSFER_TOO_SHORT" }]);
  assert.deepEqual(result.missingEvidence, [{ constraintId: "transfer", code: "TRANSFER_EVIDENCE_REQUIRED" }]);
});

test("expired opening and reservation evidence remains unknown even when projected states look positive", () => {
  const result = evaluateFeasibility({
    constraints: constraintSet([{ id: "opening", kind: "hard", type: "opening_required" }, { id: "reservation", kind: "hard", type: "reservation_required" }]),
    plan: { ...basePlan, stops: [{ ...basePlan.stops[0], openingEvidence: "expired", reservationEvidence: "expired" }, basePlan.stops[1]] },
  });
  assert.equal(result.status, "unknown");
  assert.deepEqual(result.missingEvidence.map((need) => need.constraintId), ["opening", "reservation"]);
});

test("rejects malformed candidate constraints instead of scoring invented or nonsensical inputs", () => {
  assert.throws(() => evaluateFeasibility({ constraints: constraintSet([{ id: "budget", kind: "hard", type: "max_budget", amountMinor: Number.NaN, currency: "CNY" }]), plan: basePlan }), ConstraintEngineError);
  assert.throws(() => evaluateFeasibility({ constraints: constraintSet([{ id: "window", kind: "hard", type: "arrival_window", startsAt: "not-a-date", endsAt: "2026-09-01T10:00:00.000Z" }]), plan: basePlan }), ConstraintEngineError);
  assert.throws(() => evaluateFeasibility({ constraints: constraintSet([{ id: "same", kind: "hard", type: "opening_required" }, { id: "same", kind: "hard", type: "reservation_required" }]), plan: basePlan }), ConstraintEngineError);
  assert.throws(() => evaluateFeasibility({ constraints: constraintSet([{ id: "transfer", kind: "hard", type: "min_transfer_minutes", minutes: 20 }]), plan: { ...basePlan, currency: "not-currency", stops: [{ ...basePlan.stops[0], startsAt: "not-a-date" }], transfers: [{ fromStopId: "missing", toStopId: "museum", minutes: 20, evidence: "current" }] } }), ConstraintEngineError);
  assert.throws(() => evaluateFeasibility({ constraints: constraintSet([{ id: "forged", kind: "soft", type: "max_budget", amountMinor: 0, currency: "CNY" } as unknown as ConstraintSet["constraints"][number]]), plan: basePlan }), ConstraintEngineError);
  assert.throws(() => evaluateFeasibility({ constraints: constraintSet([{ id: "opening", kind: "hard", type: "opening_required" }]), plan: { ...basePlan, stops: [{ ...basePlan.stops[0], opening: "invented" as never }] } }), ConstraintEngineError);
  assert.throws(() => evaluateFeasibility({ constraints: constraintSet([{ id: "window", kind: "hard", type: "arrival_window", startsAt: "2026-09-01T08:00:00", endsAt: "2026-09-01T10:00:00.000Z" }]), plan: basePlan }), ConstraintEngineError);
  assert.throws(() => evaluateFeasibility({ constraints: constraintSet([{ id: "opening", kind: "hard", type: "opening_required" }]), plan: { ...basePlan, stops: [{ ...basePlan.stops[0], startsAt: "2026-02-30T09:00:00.000Z", endsAt: "2026-02-30T10:00:00.000Z" }, basePlan.stops[1]] } }), ConstraintEngineError);
  assert.throws(() => evaluateFeasibility({ constraints: constraintSet([{ id: "opening", kind: "hard", type: "opening_required" }]), plan: { ...basePlan, stops: [basePlan.stops[0], { ...basePlan.stops[1], startsAt: "2026-09-01T09:30:00.000Z" }] } }), ConstraintEngineError);
});
