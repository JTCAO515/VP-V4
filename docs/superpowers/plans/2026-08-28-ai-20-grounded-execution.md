# AI-20 Grounded Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` task-by-task. This plan is executed inline because the operator requires continuous, low-intervention Issue delivery.

**Goal:** Add a deterministic, default-closed C0 boundary that turns current typed claims and evidence receipts into a renderable execution card, while keeping model explanations and raw inputs outside the boundary.

**Architecture:** The existing AI-03 `GroundedClaim`, `EvidenceReceipt`, and `ExecutionCard` types remain their owner contract. A new Knowledge-owned pure module validates a closed request shape against an explicit clock, rejects negative/stale/missing evidence, sorts claims deterministically, and returns either an immutable execution card, a non-executable low-risk result, or an honest unsupported result. A small presentational component receives only that validated card and five-locale labels; it cannot accept prompt, provider, route, database, or mutation data.

**Tech Stack:** strict TypeScript, React Server Component, Node test runner, existing AI-03 contracts, five-locale i18n.

## Global Constraints

- Issue: AI-20/#22; D2 interface baseline, repository-only and reversible.
- Preserve the existing AI-03 contracts; do not change `lib/server/contracts/**` or introduce a schema, API route, database query, provider, model call, Trip/Fact/permission write, prompt, user data, external account, or production claim.
- `low_risk_explanation` never carries an execution card. `grounded_execution` requires typed claims and exact current receipts; a negative qualifier, stale/missing receipt, unknown claim type, malformed object, future `asOf`, or invalid timezone fails closed before a value can render.
- AI-20 claims only use the existing closed types: address, time window, money, payment method, admission, transport status, and safe phrase. Qualifiers are closed codes; free text is not a qualifier channel.
- The renderer formats only validated typed values, received deterministic card rows, and five-locale labels. It does not render an LLM/model explanation.
- RL-04: named unsupported fixtures expose zero execution-card rows. RL-05: every rendered row is backed by the exact deduplicated current receipt set.
- Rollback: revert this Issue's isolated module, component, fixtures, documents, and evidence; no durable or external state exists.

---

### Task 1: Freeze the issue boundary and tests

**Files:**
- Modify: `docs/agents/issue-execution-contract.md`
- Create: `docs/contracts/grounded-execution-baseline.md`
- Create: `tests/contract/knowledge/grounded-execution.test.ts`
- Create: `tests/security/knowledge/grounded-execution-security.test.ts`
- Create: `evals/claims/grounded-execution.evals.test.ts`

**Produces:** a closed desired API and red fixtures before production implementation.

- [ ] Write the contract test importing the absent `prepareGroundedExecution` and `formatGroundedExecutionValue` APIs. It uses a reviewed Fact receipt with a future expiry, an explicit `now`, a typed money claim plus a closed condition qualifier, and expects one `execution_card` whose card evidence exactly equals its row evidence.
- [ ] Run `node --experimental-strip-types --test tests/contract/knowledge/grounded-execution.test.ts`; expect `ERR_MODULE_NOT_FOUND` because the module is absent.
- [ ] Write the security test with three named fixtures: stale Fact receipt, negative-evidence qualifier, and a forged `claimType`. Each must return `unsupported_execution` with zero card rows; a raw `explanation` key must throw before a result is produced.
- [ ] Run `node --experimental-strip-types --test tests/security/knowledge/grounded-execution-security.test.ts`; expect the same absent-module failure.
- [ ] Write the eval fixture that asserts stable claim-type/subject ordering and that an empty grounded request yields the explicit no-eligible-evidence outcome, not an invented claim.

### Task 2: Implement the smallest C0 claim-to-card module

**Files:**
- Create: `lib/server/knowledge/claim/grounded-execution.ts`

**Interfaces:**

```ts
export type ClaimQualifierV1 =
  | Readonly<{ kind: "condition"; code: "reservation_required" | "official_recheck_required" }>
  | Readonly<{ kind: "audience"; code: "ticket_holder" | "eligible_user" }>
  | Readonly<{ kind: "negative_evidence"; code: "not_confirmed" | "not_available" }>;
export type GroundedExecutionRequestV1 =
  | Readonly<{ mode: "low_risk_explanation" }>
  | Readonly<{ mode: "grounded_execution"; now: string; cardId: string; claims: readonly Readonly<{ claim: GroundedClaim; qualifiers: readonly ClaimQualifierV1[] }>[] }>;
export type GroundedExecutionOutcomeV1 =
  | Readonly<{ kind: "low_risk_explanation"; card: null }>
  | Readonly<{ kind: "execution_card"; card: ExecutionCard; rows: readonly GroundedExecutionRowV1[] }>
  | Readonly<{ kind: "unsupported_execution"; reason: "NO_ELIGIBLE_EVIDENCE" | "UNSUPPORTED_CLAIM"; card: null; rows: readonly [] }>;
export function prepareGroundedExecution(input: GroundedExecutionRequestV1): GroundedExecutionOutcomeV1;
export function formatGroundedExecutionValue(claim: GroundedClaim): string;
```

- [ ] Implement exact-key validation and strict timezone-qualified RFC3339 parsing for the explicit clock and every `asOf`/receipt timestamp.
- [ ] Call `assertGroundedClaim`; reject unknown type/value shapes. Require every Fact/Observation receipt to expire after `now`, every user-artifact confirmation to be at or before `now`, and every claim `asOf` to be at or before `now`.
- [ ] Reject a negative qualifier or an empty/stale claim set as `unsupported_execution`; reject malformed/injected records with `TypeError` before any result.
- [ ] Require the card evidence to be the exact deduplicated set of the accepted claim receipts. Sort rows by `claimType`, then `subjectId`, then a stable receipt key; deep-freeze the result.
- [ ] Format only each discriminated typed value with stable, locale-neutral separators. Preserve `timeZone` explicitly and never infer a browser/host timezone.
- [ ] Re-run the Task 1 contract, security and eval fixtures and record green output.

### Task 3: Add deterministic five-locale card presentation

**Files:**
- Create: `components/chat/cards/GroundedExecutionCard.ts`
- Modify: `lib/i18n.ts`
- Test: `tests/contract/knowledge/grounded-execution.test.ts`

**Interfaces:**

```tsx
export function GroundedExecutionCard(props: Readonly<{
  locale: Locale;
  outcome: Extract<GroundedExecutionOutcomeV1, { kind: "execution_card" }>;
}>): React.JSX.Element;
```

- [ ] Add one five-locale `executionCard` copy map containing a heading, all seven claim-type labels, and all four positive qualifier labels. Arabic is data-only and relies on the existing document-level RTL owner.
- [ ] Render only the validated outcome's card rows, deterministic values and closed qualifier labels in semantic `section`/`ul` markup. Add `data-grounded-execution-card` and `data-claim-type` markers for consumer tests; do not add a route or import this component into the current state-only Chat workspace.
- [ ] Add a server-rendered contract assertion using `renderToStaticMarkup`, checking typed money output, qualifier label, evidence-free model-text absence, and deterministic row order.
- [ ] Run the focused contract fixture and confirm it passes.

### Task 4: Evidence and acceptance

**Files:**
- Create: `docs/contracts/grounded-execution-baseline.md`
- Create: `artifacts/AI-20/acceptance.md`
- Create: `artifacts/AI-20/unrun.md`
- Create: `artifacts/AI-20/commands.jsonl`
- Modify: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`

- [ ] Record D2 interface scope, exact outcomes, RL-04 fixture count, RL-05 receipt invariant, eight-dimension applicability, Knowledge-owner observation cadence, residual risk and normal-revert rollback.
- [ ] Run in a clean isolated worktree: `pnpm check`, `pnpm test:contract`, `pnpm test:security`, `pnpm evals`, `pnpm docs:check`, a Node JSON parse for `docs/handoff.json`, and `git diff --check`. Record exact exit code/count and all intentionally unrun database/provider/browser/production checks.
- [ ] Request independent automated review. For every Critical or Important finding, add a failing regression fixture, make the smallest correction, repeat focused and broad checks, then re-review before merge.
