# V4-03 Tool Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make model ToolCallIntents pass a deterministic, fail-closed server gateway before an executor can run, with safe receipts and replay protection.

**Architecture:** `ToolRegistry` owns a static allowlist and per-call idempotency claims. `executeToolIntent` is the only execution seam: it validates policy and schemas, creates a canonical approval digest, bounds time/output, and projects untrusted tool data into an escaped receipt. No tool owns a direct Trip write path.

**Tech Stack:** TypeScript, Node `crypto`, Node built-in test runner, existing `pnpm` quality scripts.

## Global Constraints

- Issue #88 is directly schedulable; historical dependencies are context only.
- Function calls are structured requests, never authorization; unknown or policy-invalid requests must reach no executor.
- Trip truth stays Proposal/Confirm/Patch only; `trip.*` tools and unapproved external side effects are rejected at registration.
- Approval is exact-digest, output is bounded and treated as untrusted, and no receipt carries an actor identifier.
- No provider, credential, deployment, migration, or external action is part of this Issue.
- Rollback is a revert of the V4-03 commit; the feature has no data migration or persisted external state.

### Task 1: Freeze and test the gateway contract

**Files:**
- Modify: `tests/contract/tools/tool-gateway.test.ts`
- Create: `tests/security/tools/tool-gateway-security.test.ts`

**Interfaces:**
- Consumes: `ToolRegistry`, `ToolDefinition`, `executeToolIntent`.
- Produces: executable proof for no-tool, authorization, approval, replay, timeout and output-injection behavior.

- [x] Write each failing contract/security test before production code.
- [x] Run the focused test and confirm its expected failure.

### Task 2: Implement the smallest fail-closed gateway

**Files:**
- Modify: `lib/server/tools/index.ts`

**Interfaces:**
- Produces: `ToolRegistry`, `executeToolIntent`, `ToolReceipt`, and `ToolGatewayError`.
- Invariants: canonical digest; deterministic policy receipt; claim release for definite non-execution; no automatic replay after an uncertain side-effect timeout.

- [x] Implement one behavior per failing test.
- [x] Re-run the focused test after every behavior becomes green.

### Task 3: Publish the contract and evidence

**Files:**
- Create: `docs/contracts/tool-gateway.md`
- Create: `artifacts/V4-03/commands.jsonl`
- Create: `artifacts/V4-03/unrun.md`
- Modify: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`, `docs/agents/issue-execution-contract.md`

- [x] Document owner, input, output, errors, idempotency, authorization, version, consumers, anti-goals and rollback.
- [x] Record actual commands/results and any deliberately unrun external checks.

### Task 4: Verify, review, merge

**Files:**
- Verify: changed files and Issue-required scripts.

- [x] Run `pnpm check`, `pnpm test:contract`, `pnpm test:security`, `pnpm docs:check`, and `git diff --check`.
- [ ] Perform automated code review; fix every reproducible finding.
- [ ] Commit, fast-forward merge into `main`, and push `origin/main` after all gates pass.
