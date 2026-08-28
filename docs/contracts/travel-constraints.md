# Travel Constraints v1

**Owner:** Constraint Engine (#89 / V4-04)
**Status:** frozen deterministic contract baseline
**Consumers:** future TurnCoordinator, Trip Canvas proposal checker, Today checks, RoutePattern evaluator and PLAN-EVAL
**Non-consumers:** model provider, route/opening/booking provider, database client, HTTP route, payment or Trip writer

## Boundary

`evaluateFeasibility({ constraints, plan })` is a pure deterministic decision function. It accepts an already-projected `ConstraintSet` and `TravelPlan`, then returns `FeasibilityResult`: `feasible`, `infeasible`, or `unknown`; hard violations; soft tradeoffs; and evidence needs. `scoreFinalState` maps those states only to `accept`, `reject`, or `needs_evidence`.

Models may propose a candidate constraint or explain the returned result. They cannot choose a final state, add facts, calculate a budget, assert a route, override an opening state, or mutate Trip state. This module does not retrieve route matrices, live hours, reservation status, prices, or provider evidence. Missing evidence remains visible as `unknown`.

## Input contract

`ConstraintSet` has an integer revision, positive party size and unique bounded IDs. The v1 closed constraints are hard `max_budget`, `arrival_window`, `min_transfer_minutes`, `opening_required`, `reservation_required`, `transfer_evidence_required`; soft `max_stops`; and non-executable `assumption`/`missing` placeholders. The engine validates the exact `kind`/`type` variant at runtime; a forged combination is rejected rather than ignored.

`TravelPlan.totalCostMinor` and `max_budget.amountMinor` are non-negative safe-integer minor units in one ISO currency. The total is for the entire `partySize`; the caller must project any per-person pricing before invoking the engine. `priceEvidence` must be `current` before a budget may pass: `unknown` or `expired` produces `PRICE_EVIDENCE_REQUIRED`, even if the projected amount appears in range.

Stops are non-overlapping, strictly ordered RFC3339 instants with an explicit `Z` or numeric UTC offset, plus closed opening/reservation states and independent `current`/`unknown`/`expired` freshness. An `open` or `available` state with non-current evidence remains an evidence need, not a pass. Transfers may only link one ordered adjacent stop pair and state `current`, `unknown`, or `expired` evidence. Every adjacent pair required by a transfer constraint must have current evidence; absent, unknown, or expired route evidence is `TRANSFER_EVIDENCE_REQUIRED`. The caller owns currency conversion, evidence eligibility, route/provider freshness and authorisation before calling this engine; it cannot pass an unnormalised local timestamp into the engine.

Malformed unions, bounds, enum values, impossible calendar dates, timestamps, overlapping stops, stop/transfer linkage, duplicate IDs, and unknown fields on a constraint variant throw `ConstraintEngineError`; they never become a guessed result. A hard budget mismatch/excess with current price evidence, window breach, short scheduled transfer, or closed stop is a stable violation. Unknown or expired opening/reservation/transfer/price evidence is a stable evidence need. Hard violations take precedence over missing evidence; missing evidence takes precedence over soft preference scoring when deciding final status.

## Output, version and rollback

Results sort IDs deterministically and contain no actor, raw user text, provider payload, credential, payment, booking or Trip ID. The v1 scorer is deterministic and idempotent for identical input. There is no authorisation decision or side effect here; upstream actor/RLS and Proposal/Confirm/Patch contracts remain authoritative.

Rollback is a revert of #89. No migration, cache, provider call, reservation, booking, payment or Trip state exists to reverse. Unit coverage is in `tests/unit/constraints/`; PLAN-EVAL is in `evals/planning/`; command/unrun evidence is in `artifacts/V4-04/`.
