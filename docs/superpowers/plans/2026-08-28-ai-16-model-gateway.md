# AI-16 ModelGateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fixture-only, fail-closed ModelGateway seam recording frozen DeepSeek/Qwen candidates without a provider call or business-write authority.

**Architecture:** A server-only TypeScript module exports a frozen profile registry and `createFixtureModelGateway()`. It accepts synthetic C0 data only, selects an allowlisted profile, validates text or a closed known/unknown schema, and returns only `validated`, `unavailable`, or `cancelled` outcomes.

**Tech Stack:** TypeScript 5.9, Node built-in test runner, existing `FailureCode` taxonomy, pnpm.

## Global Constraints

- R1 is fixture-only: no provider route, HTTP request, environment access, provider SDK, or persistence.
- C1–C4 data fail closed before adapter behavior; raw model input/output is never logged.
- DeepSeek Flash uses API ID `deepseek-v4-flash` and explicit `thinking: "disabled"`; its observed version is never submitted as a model ID.
- Qwen strict results use the exact known/unknown discriminated union; `null`, empty, truncated, and extra-field variants are invalid.
- No Trip, Fact, permission, or external-state write may be imported or exposed.
- Preserve user-owned `app/design-tokens.generated.css`, `.playwright-cli/`, `output/`, and `test-results/` changes.
- Rollback removes this independent module/contract; production routing remains absent.

---

### Task 1: Lock ownership and add failing contract tests

**Files:**

- Create: `tests/contract/model-gateway/model-gateway.test.ts`
- Modify: `docs/agents/issue-execution-contract.md`

**Interfaces:**

- Produces desired exports: `MODEL_PROFILES`, `ModelGateway`, `createFixtureModelGateway`, and `validateKnownUnknownOutput`.

- [ ] **Step 1: Expand the AI-16 ownership row**

Replace the `#18 AI-16` row with:

```md
| #18 AI-16 | ModelGateway | `lib/server/model-gateway/**, tests/contract/model-gateway/**, docs/contracts/model-gateway.md, docs/agents/issue-execution-contract.md, artifacts/AI-16/**, docs/handoff.json, HANDOFF.md, CONTEXT.md, docs/superpowers/plans/2026-08-28-ai-16-model-gateway.md` | `pnpm check`; `pnpm test:contract`; `pnpm docs:check`; `jq empty docs/handoff.json`; `git diff --check` | provider conformance matrix, command ledger, unrun disclosure | — |
```

- [ ] **Step 2: Write a failing registry/protocol test**

```ts
test("keeps Flash thinking disabled and uses the API model id", () => {
  assert.equal(MODEL_PROFILES.deepseek_flash.providerModelId, "deepseek-v4-flash");
  assert.equal(MODEL_PROFILES.deepseek_flash.observedDeployment, "DeepSeek-V4-Flash-0731");
  assert.equal(MODEL_PROFILES.deepseek_flash.thinking, "disabled");
  assert.equal(MODEL_PROFILES.deepseek_pro.lifecycle, "ga");
  assert.equal(MODEL_PROFILES.deepseek_vision.lifecycle, "experimental");
});
```

- [ ] **Step 3: Write failing strict/policy/abort tests**

```ts
test("returns only Qwen's fixture strict known/unknown result", async () => {
  const result = await createFixtureModelGateway().invoke(strictRequest(), new AbortController().signal);
  assert.equal(result.kind, "validated");
  if (result.kind === "validated") assert.deepEqual(result.output, { kind: "known", value: "fixture-ready" });
});

test("rejects null, empty, forbidden data, and unsupported shadow vision", async () => {
  assert.equal(validateKnownUnknownOutput(null), false);
  assert.equal(validateKnownUnknownOutput({ kind: "known", value: "" }), false);
  assert.equal((await gateway.invoke({ ...strictRequest(), dataClass: "c2_sensitive" }, signal)).kind, "unavailable");
  assert.equal((await gateway.invoke({ ...strictRequest(), profileId: "deepseek_vision" }, signal)).kind, "unavailable");
});

test("returns CANCELLED before fixture output when the caller aborts", async () => {
  const controller = new AbortController(); controller.abort();
  assert.deepEqual(await createFixtureModelGateway().invoke(strictRequest(), controller.signal), { kind: "cancelled", code: "CANCELLED" });
});
```

- [ ] **Step 4: Run RED**

Run: `pnpm test:contract -- tests/contract/model-gateway/model-gateway.test.ts`

Expected: FAIL because `lib/server/model-gateway/index.ts` is absent.

### Task 2: Implement the minimal fixture Gateway

**Files:**

- Create: `lib/server/model-gateway/index.ts`
- Test: `tests/contract/model-gateway/model-gateway.test.ts`

**Interfaces:**

- Consumes: `FailureCode` from `lib/server/contracts/errors/index.ts`.
- Produces: closed request, output, and outcome types plus the gateway factory.

- [ ] **Step 1: Define the frozen API**

```ts
export type ModelProfileId = "deepseek_flash" | "deepseek_pro" | "deepseek_vision" | "qwen_37_strict";
export type ModelDataClass = "c0_synthetic" | "c1_user" | "c2_sensitive" | "c3_restricted" | "c4_secret";
export type ModelTaskRequest = Readonly<{ requestId: string; profileId: ModelProfileId; task: "ordinary_text" | "strict_known_unknown"; dataClass: ModelDataClass; input: string }>;
export type KnownUnknownOutput = Readonly<{ kind: "known"; value: string }> | Readonly<{ kind: "unknown"; reason: "fixture_no_evidence" }>;
export type ModelAttemptOutcome = Readonly<{ kind: "validated"; profileId: ModelProfileId; output: string | KnownUnknownOutput; usage: Readonly<{ inputTokens: number; outputTokens: number }> }> | Readonly<{ kind: "unavailable"; code: FailureCode; reason: "fixture_only" | "unsupported_task" | "data_policy_blocked" | "invalid_output" }> | Readonly<{ kind: "cancelled"; code: "CANCELLED" }>;
export interface ModelGateway { invoke(request: ModelTaskRequest, signal: AbortSignal): Promise<ModelAttemptOutcome>; }
```

- [ ] **Step 2: Freeze the four profile records**

Use IDs/lifecycles `deepseek_flash/beta`, `deepseek_pro/ga`, `deepseek_vision/experimental`, and `qwen_37_strict/candidate`; Flash and Qwen are `fixture_only`, Vision is `shadow_only`, and only Flash declares `thinking: "disabled"`.

- [ ] **Step 3: Implement strict-schema validation and adapter behavior**

```ts
export function validateKnownUnknownOutput(value: unknown): value is KnownUnknownOutput {
  const item = value as { kind?: unknown; value?: unknown; reason?: unknown };
  return typeof value === "object" && value !== null && ((item.kind === "known" && typeof item.value === "string" && item.value.length > 0 && Object.keys(item).length === 2) || (item.kind === "unknown" && item.reason === "fixture_no_evidence" && Object.keys(item).length === 2));
}
```

`invoke()` must first return `CANCELLED` for an aborted signal, then `DATA_POLICY_BLOCKED` for non-C0 runtime input, then `PROVIDER_UNAVAILABLE` for a profile/task mismatch. Qwen strict produces `{ kind: "known", value: "fixture-ready" }` and re-validates it before returning; Flash/Pro produce a fixed text fixture. The registry is typed as a common profile shape so task validation accepts the request's closed task union. No path makes an outbound call.

- [ ] **Step 4: Run GREEN**

Run: `pnpm test:contract -- tests/contract/model-gateway/model-gateway.test.ts`

Expected: PASS for registry, malformed output, policy block, shadow vision, and cancellation cases.

### Task 3: Publish contract and evidence

**Files:**

- Create: `docs/contracts/model-gateway.md`
- Create: `artifacts/AI-16/commands.jsonl`
- Create: `artifacts/AI-16/unrun.md`
- Modify: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`

**Interfaces:**

- Produces: profile conformance matrix, command ledger, explicit unrun disclosure, handoff state, residual risk, rollback, reading order, and one next action.

- [ ] **Step 1: Document the four-profile matrix**

Document the exact API model IDs, observed deployments, lifecycle, supported task, thinking state, and fixture/shadow routing for Flash, Pro, Vision, and Qwen. State that outcomes are closed and the seam validates protocol/schema only; it cannot produce domain truth or a write.

- [ ] **Step 2: Record all executed checks**

Append JSONL rows containing `command`, `exitCode`, `sha`, and `scope` after every required check. Mark provider API calls, account setup, region/DPA review, cost/latency measurement, and deployment as unrun because they are unauthorized and out of the R1 fixture-only scope.

### Task 4: Verify, independently review, commit, and merge

**Files:**

- Verify: every Task 1–3 file; keep user-owned paths unstaged.

**Interfaces:**

- Produces: a reviewed `main` commit with no provider activation.

- [ ] **Step 1: Run the full required suite**

Run: `pnpm check`, `pnpm test:contract`, `pnpm docs:check`, `jq empty docs/handoff.json`, and `git diff --check`.

Expected: every command exits 0 without a provider credential.

- [ ] **Step 2: Independent review**

Send the final branch diff to the existing reviewer agent, resolve each Critical/Important finding, and re-run affected checks.

- [ ] **Step 3: Commit owned paths only**

Run: `git add lib/server/model-gateway tests/contract/model-gateway docs/contracts/model-gateway.md docs/agents/issue-execution-contract.md docs/handoff.json HANDOFF.md CONTEXT.md artifacts/AI-16 docs/superpowers/plans/2026-08-28-ai-16-model-gateway.md` then `git commit -m "feat: add fixture model gateway conformance"`.

- [ ] **Step 4: Refresh and merge**

Fetch `origin/main`; if changed, rebase and re-run target checks. Fast-forward merge the reviewed commit into `main` and push. If rejected, preserve history and disclose the remote blocker.

## Self-Review

- Every Issue acceptance item maps to Task 1 (negative/abort fixtures), Task 2 (registry and protocol), Task 3 (evidence), or Task 4 (checks/review/merge).
- The plan contains no placeholder steps.
- Later tasks use Task 2's exported names consistently.

## Execution Handoff

The user has explicitly authorized inline continuous execution. Use `executing-plans` with a review checkpoint before merge.
