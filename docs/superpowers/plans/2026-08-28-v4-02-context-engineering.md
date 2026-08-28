# V4-02 Context Engineering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a deterministic, task/risk-aware ContextPlan and ContextAssembler that keeps critical constraints in stable positions, produces privacy-safe provenance, and rejects ineligible or raw unsafe context.

**Architecture:** `lib/server/context/` owns a closed TypeScript contract and pure assembler. Callers provide pre-projected candidates only; this Issue neither retrieves nor persists data, authenticates an actor, invokes a model, or executes a tool. Policies fix source order and budgets. The assembler applies source and actor eligibility before returning model text plus a manifest with references, versions, counts, reasons, and SHA-256 fingerprints only.

**Tech Stack:** Next.js 16 server TypeScript, Node `crypto`, Node test runner, existing `pnpm` CI suites.

## Global Constraints

- Historical blockers are integration context, not execution gates.
- No provider SDK, persistence adapter, database migration, raw user-artifact retrieval, or Tool execution.
- Candidates must be owner-scoped and `eligible`; draft, expired, prohibited, and cross-actor candidates never reach model text or manifest references.
- Tool output may only be a bounded model-safe projection and is rendered as untrusted data; raw tool payloads and raw user artifacts are rejected.
- `ContextManifest` stores no source text, actor IDs, or other raw sensitive data.
- Rollback is one revert; no runtime state or schema changes.

---

### Task 1: Freeze ContextPlan policy

**Files:** Create `tests/contract/context/context-plan.test.ts`, `lib/server/context/context-plan.ts`, `lib/server/context/index.ts`, and `docs/contracts/context-plan.md`.

**Interface:** `createContextPlan({ taskProfile, riskClass })` returns a frozen `ContextPlan` whose closed policy carries fixed source order, required sources, budgets, tool/evidence limits, and compaction version.

- [x] Write a failing test asserting that high-risk trip planning requires system/policy/constraints/user-message, preserves the fixed section order, assigns zero tool definitions, and rejects an unknown task profile.
- [x] Run `node --experimental-strip-types --test tests/contract/context/context-plan.test.ts`; observe module-not-found or missing-export failure.
- [x] Implement the smallest closed policy matrix and export surface.
- [x] Rerun the focused test; observe pass.

### Task 2: Assemble bounded, safe context

**Files:** Create `tests/contract/context/context-assembler.test.ts` and `lib/server/context/context-assembler.ts`; modify `lib/server/context/index.ts`.

**Interface:** `assembleContext({ plan, actorId, candidates })` returns stable rendered sections and `ContextManifest`; it throws `ContextAssemblyError` if filtering leaves a required source unavailable.

- [x] Write failing tests that demonstrate deterministic system/policy/constraints/trip/user ordering; exclusion of cross-user, draft, expired, prohibited, raw-artifact and raw-tool inputs; max-source budget behavior; and required-source failure.
- [x] Run `node --experimental-strip-types --test tests/contract/context/context-assembler.test.ts`; observe module-not-found or missing-export failure.
- [x] Implement owner/state/source filters, fixed-budget selection, untrusted-data delimiters, SHA-256 source fingerprints, and a manifest that contains no raw content or actor ID.
- [x] Rerun the focused test; observe pass.

### Task 3: Evaluation, documentation, and handoff

**Files:** Create `evals/context/context-plan.evals.test.ts`, `artifacts/V4-02/context-fixtures.json`, `artifacts/V4-02/ablation-report.md`, `artifacts/V4-02/unrun.md`, and `artifacts/V4-02/commands.jsonl`; modify `docs/agents/issue-execution-contract.md`, `docs/handoff.json`, `HANDOFF.md`, and `CONTEXT.md`.

**Interface:** Fixtures contain only synthetic IDs/text. The eval compares full history to compact thread input, retaining the same critical constraint section, while confirming all prohibited leak cases equal zero.

- [x] Add a synthetic eval for full-history versus compacted context and the leak matrix; implementation behavior was already established through the required red-green contract tests.
- [x] Run `pnpm evals`; observe the V4-02 evaluator pass with the frozen implementation.
- [x] Add privacy-safe fixtures, a documented ablation report, unrun boundary, command evidence schema, allowed-path update, and handoff facts.
- [x] Run `pnpm test:contract`, `pnpm evals`, `pnpm check`, `pnpm docs:check`, and `git diff --check`; record actual results and any environment-only skip without a bypass.

### Task 4: Review and integrate

- [ ] Commit the scoped code/tests/docs/evidence.
- [ ] Request independent automated review; repair every Critical or Important finding and rerun affected verification.
- [ ] Merge reviewed branch into `main`, push, and verify remote `main` head.

## Coverage review

- Task/risk-aware policy and source budgets: Task 1.
- Minimal stable assembly, provenance, summary/compaction version, and injection boundary: Task 2.
- Full-history/compaction comparison, zero-leak matrix, and required artifacts: Task 3.
- Automated review, reproducible checks, rollback, and remote integration: Task 4.

No external account, provider invocation, database, data migration, or raw production context is needed. Future runtime integration belongs to its owning Issues.
