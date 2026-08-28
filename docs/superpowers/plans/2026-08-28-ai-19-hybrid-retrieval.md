# AI-19 Hybrid Retrieval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` task-by-task. This plan is executed inline because the active operator instruction requires minimal manual intervention.

**Goal:** Provide a deterministic, default-closed retrieval contract that filters ineligible Facts before exact-first lexical and RRF fusion, returning opaque evidence IDs or an honest no-evidence result.

**Architecture:** AI-19 consumes the existing pure `isEligibleFact` boundary and accepts caller-provided lexical/vector ranks; it does not query a database, call an embedding/rerank provider, contain text payloads, or create a public retrieval route. A closed validator binds every vector hit to one immutable embedding profile and rejects malformed ranks, duplicate inputs, or content-bearing fields; unknown IDs are discarded and cannot fill a no-answer. The returned EvidencePack contains only RetrievalUnit/target/Fact IDs plus ranks and fusion score, so a future adapter can replace the in-memory inputs without changing the eligibility-first contract.

**Tech Stack:** strict TypeScript, Node test runner, existing Fact eligibility module, existing qrel suite.

## Global Constraints

- Issue: AI-19/#21; D2 contract baseline, repository-only and reversible.
- No Supabase migration: existing `fact_records` has no frozen retrieval text/projection schema, no local Supabase configuration exists, and Issue #21 forbids an extra schema/API/migration without a separate baseline.
- No provider, embedding generation, reranker, network, database, vector index, HNSW, public route, raw text, user data, Fact/Trip/permission write, or production capability claim.
- Eligibility always calls `isEligibleFact` before any exact/vector/RRF result enters the output (RL-02: zero leakage across candidate/draft/deprecated/expired/licence-blocked/unknown-ID fixtures).
- Exact hits order before hybrid hits. Hybrid scoring uses only `1 / (rrfK + rank)` with deterministic ID tie-breaking; missing evidence returns `no_eligible_evidence`.
- The embedding profile is a validated immutable descriptor (`modelId`, `region`, `dimensions`, `indexVersion`); no model, region, index, or feature flag is activated.
- Rollback: revert the isolated module, tests, qrel evidence, contract, and handoff updates; no durable state is created.

---

### Task 1: Freeze the AI-19 contract boundary

**Files:**
- Modify: `docs/agents/issue-execution-contract.md`
- Create: `docs/contracts/hybrid-retrieval-baseline.md`
- Create: `docs/superpowers/plans/2026-08-28-ai-19-hybrid-retrieval.md`

**Produces:** the allowed source/test/eval/evidence paths and the precise `HybridRetrievalInputV1` / `EvidencePackV1` contract.

- [ ] Add the AI-19 paths required for implementation, tests, qrels, contract, artifacts and handoff; keep every unrelated Issue path excluded.
- [ ] State the closed input fields, eligibility-before-ranking invariant, exact-first output order, RRF formula, default no-evidence behavior, unimplemented PostgreSQL/vector/provider work, eight-dimension applicability, observation owner/cadence, residual risk and rollback.
- [ ] Run `pnpm docs:check`, a Node JSON parse for `docs/handoff.json`, and `git diff --check`.

### Task 2: Prove eligibility-first and RRF behavior with red tests

**Files:**
- Test: `tests/contract/knowledge/hybrid-retrieval.test.ts`
- Test: `tests/security/knowledge/hybrid-retrieval-security.test.ts`
- Test: `evals/qrels/hybrid-retrieval.evals.test.ts`

**Consumes:** `FactEligibility` and `isEligibleFact` from `lib/server/knowledge/fact/eligibility.ts`.

**Produces:** desired API tests for:

```ts
buildHybridEvidencePack(input: HybridRetrievalInputV1): EvidencePackV1
```

- [ ] Write a contract test whose exact eligible alias result precedes a higher RRF vector result, then run it and observe the expected missing-module failure.
- [ ] Write security fixtures for `candidate`, `draft`, `deprecated`, expired and licence-blocked Facts plus an unknown hit ID; assert every result is `no_eligible_evidence` (RL-02, 6/6 denied fixtures), then observe the same feature-missing failure.
- [ ] Write eval fixtures for five locales using only opaque IDs and caller-supplied ranks; assert MRR/nDCG/no-answer calculations are delegated to closed qrels rather than treating a raw similarity score as evidence.

### Task 3: Implement the smallest pure retrieval module

**Files:**
- Create: `lib/server/knowledge/retrieval/hybrid/index.ts`

**Interfaces:**

```ts
export type EmbeddingProfileV1 = Readonly<{
  modelId: string; region: string; dimensions: number; indexVersion: string;
}>;
export type HybridRetrievalInputV1 = Readonly<{
  now: string; profile: EmbeddingProfileV1; rrfK: number;
  units: readonly RetrievalUnitV1[]; lexical: readonly RankedRetrievalHitV1[];
  vector: readonly RankedRetrievalHitV1[];
}>;
export type EvidencePackV1 =
  | Readonly<{kind: "evidence_pack"; profile: EmbeddingProfileV1; items: readonly EvidenceItemV1[]}>
  | Readonly<{kind: "no_eligible_evidence"; profile: EmbeddingProfileV1}>;
export function buildHybridEvidencePack(input: HybridRetrievalInputV1): EvidencePackV1;
```

- [ ] Implement closed runtime validation for every object, rank, opaque descriptor (`[A-Za-z0-9._-]`), valid timezone-qualified RFC3339 timestamp and duplicate.
- [ ] Filter units through `isEligibleFact` before associating lexical/vector hits; discard unknown hit IDs, and reject duplicate hit IDs rather than silently using them.
- [ ] Emit eligible exact lexical hits first; calculate RRF only for the remaining eligible IDs; break ties by ASCII ID; emit no-evidence if no eligible output remains.
- [ ] Run each Task 2 test after implementation and record passing output.

### Task 4: Evidence, broad checks and review

**Files:**
- Create: `artifacts/AI-19/commands.jsonl`
- Create: `artifacts/AI-19/unrun.md`
- Create: `artifacts/AI-19/acceptance.md`
- Modify: `docs/handoff.json`, `HANDOFF.md`, `CONTEXT.md`

- [ ] Run `pnpm typecheck`, `pnpm test:contract`, `pnpm test:security`, `pnpm evals`, `pnpm db:verify`, `pnpm docs:check`, `pnpm check`, and `git diff --check`; record actual exit codes and disclose any unavailable local database or non-applicable browser/production checks.
- [ ] Capture expected red, fixture counts, eight-dimension applicability, D2 contract baseline rationale, observation owner/cadence, residual risk and rollback in `acceptance.md`.
- [ ] Request independent automated review; correct any Critical/Important finding through a new red-green test cycle; merge only after a clear re-review.
