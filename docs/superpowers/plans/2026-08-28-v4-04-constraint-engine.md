# V4-04 Constraint Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` task-by-task with a failing test before every production behavior.

**Goal:** Deliver a deterministic, explainable feasibility engine for travel constraint sets, including hard violations, soft tradeoffs, missing evidence and a final-state scorer.

**Architecture:** A pure `lib/server/constraints` module validates a closed constraint/input model and returns a stable `FeasibilityResult`. It treats provider data as already projected evidence; it neither retrieves routes nor calls models, writes Trip state, or invents missing facts.

**Tech Stack:** TypeScript, Node built-in test runner, existing `pnpm` contract/eval scripts.

## Global Constraints

- #89 is directly schedulable; historical dependency labels are integration context only.
- Models may extract or explain candidate constraints but cannot decide feasibility, totals, time windows or final plan state.
- Missing/expired route, opening, booking or price evidence produces visible `unknown`, never a guessed pass.
- Trip remains Proposal/Confirm/Patch only; the engine is pure and owns no persistence, route provider, auth, payment or booking action.
- Rollback is a revert of the #89 merge; no data migration or external action is created.

### Task 1: Freeze contract and red tests

**Files:** `tests/unit/constraints/**`, `evals/planning/**`, `lib/server/constraints/**`.

- [x] Specify closed hard/soft/assumption/missing constraints, route/opening evidence, violations, tradeoffs and deterministic score.
- [x] Write and run failing tests for budget, time window, transfer, opening, missing evidence and stable final state.

### Task 2: Implement pure checker

**Files:** `lib/server/constraints/**`.

- [x] Validate inputs and evaluate hard constraints before soft preference scoring.
- [x] Emit stable feasible/infeasible/unknown outcomes and explainable evidence needs.
- [x] Re-run focused unit and eval tests, including forged unions, price evidence, offset instants and incomplete route-chain regressions.

### Task 3: Archive evidence and integrate governance

**Files:** `docs/contracts/travel-constraints.md`, `artifacts/V4-04/**`, handoff files.

- [x] Document owner/input/output/errors/idempotency/authorization/version/consumers, assumptions and rollback.
- [x] Record commands, synthetic corpus and deliberately unrun external observations.

### Task 4: Verify, review, merge

- [x] Run Issue-required suites and documentation/diff checks.
- [x] Complete two automated review cycles, fix all Critical/Important findings, then verify before merge and push.
