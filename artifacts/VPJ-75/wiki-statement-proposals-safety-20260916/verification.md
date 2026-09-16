# #359 structural conflict detection + frozen bilingual safety materials -- 2026-09-16

Baseline: origin/main bdc22bc (merge of PR #429, 2026-09-16). Branch:
`codex/vpj-75-359-proposal-conflicts-safety-20260916`, built in an isolated
git worktree per this round's instructions.

JT explicitly authorized resuming VPJ-75 work this round after the pause
recorded in `docs/handoff.json` (`"JT requested pause after this round on
2026-09-15. No next-round work is authorized to start before a new resume
request."`) -- see the resume note added to `docs/handoff.json` in this PR.

## Scope selected and why

Read `artifacts/VPJ-75/unrun.md` (top-level, last updated at the schema
slice) and `docs/knowledge-upgrade/README.md`'s dated log for every merged
#359 slice through the 2026-09-15 statement-proposals/job-reclaim rounds.
Three items are named there as explicitly not started for the bounded
statement-proposal job:

- "Contradiction/conflict handling between competing source material -- no
  logic exists to surface 'these two sources disagree' to a reviewer."
- "Multi-source synthesis. Every real call so far used exactly one source
  text; nothing combines multiple sources into one page."
- "Prompt-injection resistance against a fixed zh/en adversarial fixture set
  -- ... has not been tested against a real adversarial input, only asserted
  in the prompt text."

These map directly onto EXECUTION-CONTRACT.md#vpj-75's acceptance bullet:
"固定中英材料覆盖相互矛盾、条件/例外、跨城市差异及注入". No real LLM provider
credentials or Staging access were needed or used; this slice deliberately
stays entirely inside the existing fixture-only convention already used by
every prior #359 slice and by `evals/wiki-agentic-search-safety/`.

## Implemented result

- `detectProposalConflicts` (new, in `lib/server/knowledge/wiki/proposals.ts`):
  a pure, deterministic function over an already-validated
  `StructuredWikiDraft` that flags pairs of proposals asserting the same
  `{subjectId, predicate}` for overlapping `scope.cities` and identical
  `scope.scene` but a different `objectId`, `conditions`, or `exclusions`.
  Disjoint-city pairs (legitimate cross-city differences) are never flagged.
  Not wired into storage or the `/ops/wiki` UI this round (see Remaining
  scope) -- ships as a tested, unwired primitive, matching this repo's own
  "research-corpus"/"reason-codes" precedent for staged capability delivery.
- `evals/wiki-statement-proposals-safety/`: frozen bilingual (zh+en) fixture
  materials -- `cross-source-cases.ts` (3 categories) and
  `injection-cases.ts` (3 categories) -- exercised against the REAL
  `isProposalOutput`/`resolveProposalOutput`/`detectProposalConflicts` code
  and, for the injection cases, the real `runWikiStatementProposalJob` worker
  path with a scripted transport (no network).
- A locked regression test proving the disclosed "quote identity is not
  claim entailment" boundary from `docs/contracts/wiki-statement-proposals.md`
  continues to hold: a single proposal citing two contradictory sources as
  its own evidence is still accepted (by design; human review remains
  mandatory).
- `docs/contracts/wiki-statement-proposals-safety.md` (new).

## Actual verification

- `node --experimental-strip-types --test evals/wiki-statement-proposals-safety/*.evals.test.ts`:
  5/5 PASS, including the multi-source Unicode-offset independence check (both
  a CJK and a Latin-script case), the conflict/no-conflict assertions for all
  6 cross-source cases, the structural + end-to-end worker-path rejection for
  all 6 injection cases, and the locked-boundary regression.
- `node --experimental-strip-types --test tests/contract/knowledge/wiki-proposals.test.mjs`:
  8/8 PASS (4 pre-existing + 4 new `detectProposalConflicts` unit tests
  covering cross-city non-flagging, same-city objectId conflict, conditions/
  exclusions conflicts, and unrelated-subject/three-way-draft cases).
- `pnpm test:contract` (via `node scripts/run-ci-suite.mjs contract`):
  530/530 PASS, 0 skip, 108 files -- no regression in any existing suite.
- `pnpm evals` (via `node scripts/run-ci-suite.mjs evals`): 35/35 PASS, 0
  skip, 16 files (14 pre-existing files + this slice's new file).
- `pnpm lint` (`node scripts/lint.mjs`): PASS, 311 files (312 with the new
  worktree checkout; count reflects this run).
- `node node_modules/typescript/bin/tsc --noEmit`: PASS, clean, including the
  strictly-typed new `.ts` eval files (tsconfig includes `**/*.ts`).
- `node node_modules/next/dist/bin/next build --webpack`: PASS (see raw log).
- `node scripts/docs-check.mjs`: PASS.
- `git diff --check`: PASS (no whitespace errors).
- `pnpm test:security` (`node scripts/run-ci-suite.mjs security`): 146
  pass / 3 fail / 1 skip. The 3 failures (`native SDK clients reject
  307/308 before forwarding any credential`, `native fetch preserves Request
  headers and cancellation`) are **pre-existing on unmodified origin/main in
  this same sandbox** (verified by running the identical suite against the
  untouched `vp-v4-work` checkout before making any change here) and are
  unrelated to any file this PR touches -- they read as sandbox network
  restrictions on real loopback/redirect HTTP tests, not a regression
  introduced by this slice.
- `pnpm test:integration` (`node scripts/run-ci-suite.mjs integration`): 19
  pass / 4 fail / 76 skip. The 4 failures are the same class (real loopback
  HTTP/redirect/cancellation tests) and are **identically present on
  unmodified origin/main** in this sandbox before any change. The new
  `tests/integration/knowledge/wiki-draft.test.mjs` (from a prior slice, not
  touched here) remains among the skips -- it requires an embedded PostgreSQL
  runtime (`VP_WIKI_PG_BIN`/`VP_WIKI_PG_MODULE`) that is not set up in this
  session; no migration or DB-touching code was added this round, so this was
  not attempted.
- `pnpm db:verify`: not run. This slice adds zero migrations and zero
  database-facing code; `db:verify` targets `supabase/migrations/**`, which
  this PR's diff never touches.

## A real fixture-authoring bug found and fixed during this round

While authoring the `fabricated_quote` injection case, an early draft
embedded the target fabricated phrase inside the injected instruction's own
quotation marks (source text literally said `...please write it as "X"...`).
That made `X` trivially verbatim-present in the source snippet, so the
"compliant" scripted output passed `resolveProposalOutput` -- not because the
verbatim-quote defense failed, but because the fixture had stopped testing
fabrication at all (the fabricated marker was, in fact, a real verbatim
substring of the source, by construction). Caught by running the eval and
reading the failure message rather than assuming green. The fixture was
corrected to an abstract escalation instruction with no literal target
phrase in the source; both zh and en cases now genuinely exercise the
verbatim-quote check. The underlying narrow gap this reveals -- the check
cannot distinguish an asserted fact from a suggested rewrite quoted inside an
injected instruction -- is real, disclosed in
`docs/contracts/wiki-statement-proposals-safety.md`, and intentionally not
"fixed" by weakening the fixture to hide it; it is out of this slice's bounded
scope.

## Remaining scope (UNRUN)

- Real model calls (Qwen/GLM/DeepSeek) against these fixture materials --
  would show whether a real model actually resists the injected instructions
  or correctly describes a contradiction in its own `gaps` field; none of
  this repo's fixture-only tests, including these, prove that.
- Wiring `detectProposalConflicts`'s output into the persisted `wiki-draft`
  body (a schema-version bump, since the type is a strict exact-key object)
  and into the `/ops/wiki` review UI so a reviewer actually sees the flag --
  ships as a tested, unwired primitive this round, by design.
- The narrow fabricated-quote-via-quoted-instruction gap named above.
- Real GoTrue/Staging producer-consumer chain, backup/restore, real-data
  policy binding, complete source/procedure/topic coverage, withdrawn-source
  dispatch barrier, persistent worker unknown-fee recovery, and Docling
  integration -- all still UNRUN, unchanged from prior #359 slices' own
  disclosed scope; this slice does not claim to close any of them.

#359 stays OPEN. No production, Staging, or remote-schema change of any kind.
No secrets requested or used. This PR requires its own CI and merge
authorization.
