# AI-17 Routing and Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fixture-only ModelGateway route policy, retry/circuit controls, and privacy-safe attempt/cost trace projections without enabling any provider, persistence, or domain write.

**Architecture:** `lib/server/model-gateway/route/` owns a deterministic profile selector and circuit state, consuming the frozen AI-16 profile registry but never invoking it. `lib/server/observability/` owns a content-free trace builder and integer-microunit cost snapshot. Both return closed outcomes and use no SDK, HTTP, environment variable, database, or provider key.

**Tech Stack:** TypeScript 5.9, Node built-in test runner, existing ModelGateway profile registry and failure taxonomy, pnpm.

## Global Constraints

- R1/R2 remains fixture-only: no provider transport, network, credential, environment read, account, region selection, persistence, deployment, or public capability claim.
- Only C0 synthetic/text fixture inputs with `fixture_only` region may route. C1–C4, unapproved region, policy block, safety block, raw input/output/reasoning/media, and malformed runtime input fail closed.
- A safety, policy, auth, cancellation, or post-output failure can never cross-provider fallback; only pre-output provider/timeout/schema failures may be assessed by the deterministic retry function.
- DeepSeek Flash remains ordinary text with thinking disabled; Qwen 3.7 remains strict known/unknown; Vision remains shadow-only and never routes.
- Trace records contain only allowlisted identifiers, non-content counters, timestamps, status, model/version, usage, price version, cost and latency. `recordInputs` and `recordOutputs` are always `false`.
- No Trip, Fact, permission, tool, external state, or domain truth is imported or written. Preserve user-owned generated CSS and helper/result directories.
- Rollback removes the independent route/observability modules and their consumer-free documents/tests; no external or durable state requires rollback.

---

### Task 1: Freeze AI-17 ownership and write route tests first

**Files:**

- Modify: `docs/agents/issue-execution-contract.md`
- Create: `tests/contract/model-gateway/route.test.ts`

**Interfaces:**

- Consumes: `ModelProfileId`, `ModelDataClass`, `MODEL_PROFILES`, and `FailureCode`.
- Produces desired exports `resolveFixtureRoute`, `canFallback`, and `FixtureCircuitBreaker`.

- [x] **Step 1: Expand the AI-17 row to include its required tests, contract, evidence and handoff**

```md
| #19 AI-17 | ModelGateway / Observability | `lib/server/model-gateway/route/**, lib/server/observability/**, tests/{contract,integration}/model-gateway/**, tests/contract/observability/**, docs/contracts/model-routing-observability.md, docs/agents/issue-execution-contract.md, artifacts/AI-17/**, docs/handoff.json, HANDOFF.md, CONTEXT.md, docs/superpowers/plans/2026-08-28-ai-17-routing-observability.md` | `pnpm check`; `pnpm test:contract`; `pnpm test:integration`; `pnpm docs:check`; `jq empty docs/handoff.json`; `git diff --check` | trace sample, cost/route snapshots, command ledger, unrun disclosure | RL-07 |
```

- [x] **Step 2: Write failing route, denial, fallback and circuit tests**

```ts
test("routes only synthetic ordinary and strict fixture tasks to their frozen baseline profiles", () => {
  assert.deepEqual(resolveFixtureRoute(ordinaryRequest()), { kind: "route", profileId: "deepseek_flash", lane: "baseline" });
  assert.deepEqual(resolveFixtureRoute(strictRequest()), { kind: "route", profileId: "qwen_37_strict", lane: "baseline" });
});

test("fails closed before route selection for policy, safety, data class, region, vision and malformed input", () => {
  assert.equal(resolveFixtureRoute({ ...ordinaryRequest(), policy: "blocked" }).code, "DATA_POLICY_BLOCKED");
  assert.equal(resolveFixtureRoute({ ...ordinaryRequest(), safety: "blocked" }).code, "SAFETY_BLOCKED");
  assert.equal(resolveFixtureRoute({ ...ordinaryRequest(), dataClass: "c2_sensitive" }).code, "DATA_POLICY_BLOCKED");
  assert.equal(resolveFixtureRoute({ ...ordinaryRequest(), region: "unapproved" }).code, "DATA_POLICY_BLOCKED");
  assert.equal(resolveFixtureRoute({ ...ordinaryRequest(), modality: "vision" }).code, "PROVIDER_UNAVAILABLE");
  assert.equal(resolveFixtureRoute(null).code, "INVALID_INPUT");
});

test("never falls back after output or across a policy/safety/auth/cancel terminal outcome", () => {
  assert.equal(canFallback({ code: "PROVIDER_UNAVAILABLE", emittedOutput: false }), true);
  assert.equal(canFallback({ code: "TIMEOUT_BEFORE_OUTPUT", emittedOutput: false }), true);
  assert.equal(canFallback({ code: "MODEL_OUTPUT_INVALID", emittedOutput: false }), true);
  assert.equal(canFallback({ code: "DATA_POLICY_BLOCKED", emittedOutput: false }), false);
  assert.equal(canFallback({ code: "SAFETY_BLOCKED", emittedOutput: false }), false);
  assert.equal(canFallback({ code: "UNAUTHENTICATED", emittedOutput: false }), false);
  assert.equal(canFallback({ code: "PROVIDER_UNAVAILABLE", emittedOutput: true }), false);
});

test("opens a profile circuit after bounded pre-output provider failures and recovers only after cooldown", () => {
  const circuit = new FixtureCircuitBreaker({ threshold: 2, cooldownMs: 1_000 });
  circuit.record("deepseek_flash", "PROVIDER_UNAVAILABLE", 0);
  assert.equal(circuit.isOpen("deepseek_flash", 1), false);
  circuit.record("deepseek_flash", "TIMEOUT_BEFORE_OUTPUT", 10);
  assert.equal(circuit.isOpen("deepseek_flash", 999), true);
  assert.equal(circuit.isOpen("deepseek_flash", 1_010), false);
});
```

- [x] **Step 3: Run RED**

Run: `node --experimental-strip-types --test tests/contract/model-gateway/route.test.ts`

Expected: FAIL because the route module does not exist.

### Task 2: Implement the narrow routing and circuit policy

**Files:**

- Create: `lib/server/model-gateway/route/index.ts`
- Test: `tests/contract/model-gateway/route.test.ts`

**Interfaces:**

- Consumes: AI-16 profile registry and `FailureCode`.
- Produces: closed request/decision types, `resolveFixtureRoute`, `canFallback`, and `FixtureCircuitBreaker`.

- [x] **Step 1: Define the closed route and retry inputs**

```ts
export type FixtureRouteRequest = Readonly<{ task: "ordinary_text" | "strict_known_unknown"; dataClass: ModelDataClass; modality: "text" | "vision"; schema: "none" | "known_unknown"; region: "fixture_only" | "unapproved"; policy: "allowed" | "blocked"; safety: "clear" | "blocked" }>;
export type FixtureRouteDecision = Readonly<{ kind: "route"; profileId: "deepseek_flash" | "qwen_37_strict"; lane: "baseline" }> | Readonly<{ kind: "unavailable"; code: FailureCode }>;
export type FallbackAssessment = Readonly<{ code: FailureCode; emittedOutput: boolean }>;
```

- [x] **Step 2: Implement ordered fail-closed selection**

Return `INVALID_INPUT` for malformed values, then `DATA_POLICY_BLOCKED` for non-C0/unapproved/policy-blocked requests, then `SAFETY_BLOCKED`, then `PROVIDER_UNAVAILABLE` for vision/schema mismatch/shadow/disabled profiles. Return only Flash for ordinary text with `schema: "none"`, and only Qwen strict for strict known/unknown text. Never return Pro, Vision or an arbitrary profile.

- [x] **Step 3: Implement retry eligibility and circuit state**

```ts
export function canFallback(attempt: FallbackAssessment): boolean {
  return !attempt.emittedOutput && (attempt.code === "PROVIDER_UNAVAILABLE" || attempt.code === "TIMEOUT_BEFORE_OUTPUT" || attempt.code === "MODEL_OUTPUT_INVALID");
}
```

`FixtureCircuitBreaker.record(profileId, code, nowMs)` counts only `canFallback({ code, emittedOutput: false })` outcomes; its per-profile state opens at the configured positive integer threshold and `isOpen()` clears state only after its finite positive cooldown. Invalid constructor/clock values throw before state changes.

- [x] **Step 4: Run GREEN**

Run: `node --experimental-strip-types --test tests/contract/model-gateway/route.test.ts`

Expected: PASS for all route, denial, retry and circuit fixtures.

### Task 3: Add content-free attempt/cost trace contracts

**Files:**

- Create: `lib/server/observability/model-attempt.ts`
- Create: `tests/contract/observability/model-attempt.test.ts`
- Create: `tests/integration/model-gateway/route-observability.test.ts`

**Interfaces:**

- Consumes: a `FixtureRouteDecision`, `FailureCode`, and integer non-content usage/price inputs.
- Produces: `buildModelAttemptTrace` and `calculateCostMicros` for later transport consumers.

- [x] **Step 1: Write failing trace and integration tests**

```ts
test("builds an allowlisted completed trace with fixed content-recording booleans and integer cost", () => {
  const trace = buildModelAttemptTrace(validTraceInput());
  assert.deepEqual(trace.recordInputs, false);
  assert.deepEqual(trace.recordOutputs, false);
  assert.equal(trace.costMicros, 43);
  assert.equal("prompt" in trace, false);
  assert.equal("output" in trace, false);
});

test("rejects raw-content keys, invalid prices and negative counters", () => {
  assert.throws(() => buildModelAttemptTrace({ ...validTraceInput(), prompt: "never-record" } as never));
  assert.throws(() => calculateCostMicros({ inputTokens: -1, outputTokens: 1, inputMicrosPerToken: 1, outputMicrosPerToken: 1 }));
});

test("records an unavailable route as metadata only", () => {
  const route = resolveFixtureRoute({ ...ordinaryRequest(), policy: "blocked" });
  const trace = buildModelAttemptTrace(traceInputFor(route));
  assert.equal(trace.outcomeCode, "DATA_POLICY_BLOCKED");
  assert.equal(trace.recordInputs, false);
});
```

- [x] **Step 2: Run RED**

Run: `node --experimental-strip-types --test tests/contract/observability/model-attempt.test.ts tests/integration/model-gateway/route-observability.test.ts`

Expected: FAIL because the observability module does not exist.

- [x] **Step 3: Implement the content-free trace builder**

```ts
export type ModelAttemptTrace = Readonly<{ attemptId: string; profileId: ModelProfileId; provider: "deepseek" | "qwen"; requestedModel: string; observedDeployment: string; routeLane: "baseline"; outcomeCode: FailureCode | "VALIDATED"; inputTokens: number; outputTokens: number; latencyMs: number; priceVersion: string; costMicros: number; recordInputs: false; recordOutputs: false }>;

export function calculateCostMicros(input: Readonly<{ inputTokens: number; outputTokens: number; inputMicrosPerToken: number; outputMicrosPerToken: number }>): number {
  for (const value of Object.values(input)) if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("Usage and price inputs must be non-negative safe integers.");
  const cost = input.inputTokens * input.inputMicrosPerToken + input.outputTokens * input.outputMicrosPerToken;
  if (!Number.isSafeInteger(cost)) throw new RangeError("Cost exceeds the safe integer range.");
  return cost;
}
```

The builder validates bounded IDs, profile/registry consistency, non-negative safe integer usage/latency, price version, the absence of prohibited content keys, and a registered failure code when unavailable. It never accepts or returns content fields and sets the two recording booleans literally to `false`.

- [x] **Step 4: Run GREEN**

Run: `pnpm test:contract` and `pnpm test:integration`.

Expected: both suites pass; no route invokes a provider.

### Task 4: Publish evidence, verify, review and merge

**Files:**

- Create: `docs/contracts/model-routing-observability.md`
- Create: `artifacts/AI-17/commands.jsonl`, `artifacts/AI-17/unrun.md`
- Modify: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`

**Interfaces:**

- Produces: route/trace/cost matrix, RL-07 fixture count and runtime invariant, eight-dimension applicability, residual risk, rollback, reading order, and one next action.

- [x] **Step 1: Document routes and observability truthfully**

Document Flash ordinary baseline, Qwen strict baseline, Vision/Pro unavailable behavior, deny-before-fallback ordering, circuit threshold/cooldown fixture semantics, exact trace allowlist, fixed `recordInputs:false`/`recordOutputs:false`, integer price snapshot, and the explicit lack of a provider transport. State `RL-07: 0/6 observed trace-content violations in deterministic fixtures; runtime invariant: only allowlisted metadata reaches a trace`.

- [x] **Step 2: Record commands and unrun checks**

Record every actual command with command, exit code, SHA, and scope. `unrun.md` must list live provider routing, real cost/usage, region/DPA, provider outages, stream/after-output behavior, account/configuration, persistence, production, browser, and `jq` as unrun where applicable.

- [x] **Step 3: Run full acceptance**

Run: `pnpm check`, `pnpm test:contract`, `pnpm test:integration`, `pnpm docs:check`, Node JSON parse for `docs/handoff.json`, and `git diff --check`.

Expected: all exit 0; document any non-applicable L5–L7 evidence.

- [ ] **Step 4: Obtain independent automated review, commit owned files, refresh, fast-forward merge, and push**

Review only the AI-17 owned paths; resolve Critical/Important findings and rerun affected checks. Stage only the expanded execution-contract row's paths, commit `feat: add fixture route observability`, fetch `origin/main`, rebase only if needed, fast-forward merge into `main`, and push. A remote rejection is recorded without force-pushing.

## Self-Review

- Scope coverage: Tasks 1–2 cover routing/fallback/circuit behavior; Task 3 covers trace, pricing, RL-07 and integration; Task 4 covers evidence, all required gates, review and merge.
- The plan has no provider or persistence work, no incomplete implementation placeholders, and no new dependency.
- The route module consumes AI-16 types only; it does not change AI-16 owned paths.

## Execution Handoff

The user has already authorized continuous inline execution. Use `executing-plans` task-by-task and retain an independent review gate before merging.
