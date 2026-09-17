# VPJ-76 (#360): tune maxRounds relative to a question's required-claim count

## What this is

One of the three concrete, named follow-ups from the 2026-09-16 real-model
pass over the frozen evaluation set
(`artifacts/VPJ-76/wiki-frozen-eval-real-model-20260916/verification.md`,
"Recommended follow-up work"): *"(a) tune `maxRounds` relative to a
question's required-claim count"*. That real GLM run found 3 of 11
mismatches were genuine, honest partial answers caused by a multi-claim
question (e.g. `payment_getting_started`, 4 required claims) running out
of search rounds under a flat `maxRounds: 2` used by every caller
(`app/api/chat/grounded/ai-assist/route.ts`,
`lib/server/turn/native-ai-assist-http.ts`,
`scripts/eval/run-wiki-agentic-real-model.mjs`,
`scripts/eval/run-wiki-agentic-injection-real-model.mjs`, and the frozen
eval harness itself) — a tuning signal, not a defect, per that round's own
honest write-up. This is VPJ-76's own acceptance criterion #6's "调参"
(parameter tuning) requirement, still unstarted as of round 20's handoff.

## What changed

`lib/server/knowledge/wiki/grounded-search.ts`: a new pure exported
function, `tunedMaxRounds(requestedMaxRounds, requiredClaimCount)`, returns
`max(requestedMaxRounds, min(6, requiredClaimCount + 1))` — 6 mirrors
`wiki-search-job.ts`'s own independently-enforced hard bound
(`validInput`: `maxRounds` 1–6). `runGroundedWikiSearch` now computes
`requiredClaimCount` from the already-resolved `questionDefinition()`
(`definition?.claims.length ?? 0`, exactly the count already used to build
`EvidencePack.required`) and passes `tunedMaxRounds(input.maxRounds,
requiredClaimCount)` to `runWikiSearchJob` instead of `input.maxRounds`
directly.

This is the **only** change. It:

- Never lowers what a caller explicitly requested (`max(...)`).
- Never exceeds `runWikiSearchJob`'s own hard bound (`min(6, ...)`).
- Is internal to `runGroundedWikiSearch` — no caller (production routes,
  the real-model scripts, or the frozen eval harness) needed a code change
  to benefit, since they all call through this one function.
- Leaves place questions unaffected (`requiredClaimCount` is always 0 for
  them, since this module has never resolved a `placeSubjectId` — an
  existing, documented scope decision from slice 6, unchanged here).
- Leaves every single-required-claim question (`payment_card_acceptance`,
  `payment_mobile_setup`, `connectivity_sim_documents`,
  `connectivity_plan_allowances`) unaffected under every caller's current
  `maxRounds: 2`, since `min(6, 1+1) = 2` equals what callers already pass.
- Only raises the effective round budget (from every current caller's
  flat 2) for the seven multi-claim questions:
  `rail_boarding_documents` (2 claims → floor 3),
  `payment_cash_access` (2 claims → floor 3),
  `payment_card_and_mobile` (2 claims → floor 3),
  `payment_card_and_cash` (3 claims → floor 4),
  `payment_mobile_and_cash` (3 claims → floor 4),
  `payment_getting_started` (4 claims → floor 5),
  `connectivity_getting_started` (2 claims → floor 3).
  The four single-claim questions
  (`payment_card_acceptance`, `payment_mobile_setup`,
  `connectivity_sim_documents`, `connectivity_plan_allowances`) each have
  floor 2, identical to every current caller's existing `maxRounds: 2` —
  unchanged.

## Real verification (fixture-only — no real model credential in this
sandbox, consistent with every other slice in this thread)

New tests in `tests/contract/knowledge/wiki-grounded-search.test.mjs`:

1. **Direct unit test of the pure function** — `tunedMaxRounds` raises the
   floor to `requiredClaimCount+1` capped at 6, never lowers a caller's
   request; 5 assertions covering the 0-claim/1-claim/4-claim/over-cap/
   caller-already-higher cases.
2. **A real end-to-end proof, not just the pure function in isolation** —
   `payment_getting_started` (4 real claims from `QUESTION_DEFINITIONS`)
   run through the real `runGroundedWikiSearch` with `maxRounds: 2` and a
   scripted fetch that always returns a `search` action (never answers):
   the outcome is `budget_exhausted` at **5** rounds with the model
   actually invoked **5** real times — proving the tuning floor actually
   reaches the real model-call loop, not just the intermediate
   computation. Before this change, this same input would have hit
   `budget_exhausted` at round 2 with only 2 real model calls.
3. **A regression proof for the single-claim case** —
   `payment_card_acceptance` (1 claim) under the same scripted
   always-search fetch still hits `budget_exhausted` at exactly round 2
   with exactly 2 calls: the existing default caller behavior for
   single-claim questions is provably unchanged.

Ran `node --test tests/contract/knowledge/wiki-grounded-search.test.mjs`:
**18/18 pass** (15 pre-existing + 3 new), no regressions to any existing
assertion (including the pre-existing "budget_exhausted and cancelled
pass through" test, which uses the 1-claim `payment_card_acceptance`
intent and is therefore numerically unaffected by this change).

Ran the frozen eval harness (`evals/wiki-agentic-search/wiki-agentic-search.evals.test.ts`,
fixture mode): **34/34 still PASS**, coverage rate 90.9% and over-refusal
rate 9.1% both **numerically unchanged** from the pre-existing
`wiki-frozen-eval-20260915/results.json` baseline. This is not a
coincidence: the frozen set's one `budget_exhausted` scenario
(`diversity-budget-exhausted-zh`) uses `place_opening_hours` — a place
question with `requiredClaimCount = 0`, so `tunedMaxRounds(2, 0) = 2`,
unchanged — and every multi-claim scenario in the frozen set is
`full_coverage`/`partial_coverage`, whose fixture `fetchFor` always
returns an `answer` action on the very first call regardless of round
budget. The frozen set's own recorded metrics are therefore a stable,
unaffected baseline; the new contract tests above are what actually
exercises the tuning behavior for real.

**Not verified for real:** whether this tuning floor actually improves
real-model accuracy on the frozen set's multi-claim scenarios (the
specific claim the 2026-09-16 follow-up note was about) — that would
require re-running `scripts/eval/run-wiki-agentic-real-model.mjs` against
a real GLM credential, which is not present in this sandbox and was not
separately re-authorized this round for additional real spend. The
mechanism this round adds is real and verified end to end against the
real (non-mocked) `runGroundedWikiSearch`/`runWikiSearchJob` code path
with a scripted transport; only the real-model accuracy delta remains an
open, explicitly-named gap, not a silently assumed win.

## Full check suite (this diff, `lib/server/knowledge/wiki/grounded-search.ts`
and `tests/contract/knowledge/wiki-grounded-search.test.mjs` only — no
migration, no RPC, no schema change)

- `pnpm lint`: PASS (319 files).
- `pnpm typecheck`: PASS, clean.
- `pnpm build`: PASS (`next build --webpack`).
- `pnpm test`: PASS, 22/22.
- `pnpm test:contract`: PASS, **553/553** (550 baseline + 3 new).
- `pnpm test:unit`: PASS, 114/114.
- `pnpm evals`: PASS, 35/35 (includes the frozen wiki-agentic-search set
  above, unchanged metrics).
- `pnpm test:security`: PASS, 149 pass / 0 fail / 1 skip (pre-existing,
  unrelated skip).
- `pnpm test:integration`: PASS, 39 pass / 0 fail / 77 skip (pre-existing
  environment-dependent skips, unrelated to this change).
- `pnpm docs:check`: PASS.
- `pnpm check:flags`: PASS (2 R1 flags).
- `pnpm check:assets`: PASS (49 ledger records).
- `pnpm db:verify`: unchanged, `not-configured` (this round touches zero
  migrations/RPCs).
- `git diff --check`: clean, no whitespace errors.
- `pnpm evals`/`pnpm test:contract` produced their usual unrelated
  artifacts/** timestamp/timing side-effect files (VPJ-206, VPJ-66,
  VPJ-70, VPJ-72, VPJ-75, VPJ-76's own frozen-eval summary.md); all
  reverted with `git checkout --` before committing, matching this
  thread's existing convention.

## Scope discipline

- Zero migrations, zero new RPCs, zero changes to `wiki-search-job.ts`'s
  own hard bound or validation.
- Does not touch `#248`'s vector/hybrid retrieval or reranking scope.
- Does not touch Docling/#288's REJECT decision.
- Does not change any caller file (`route.ts`, `native-ai-assist-http.ts`,
  the real-model eval scripts) — the fix is internal to
  `runGroundedWikiSearch`, so every existing caller inherits it
  transparently without a separate edit.

## What this does not do / remaining VPJ-76 gaps

This slice addresses exactly one of the three named 2026-09-16
follow-ups. The other two remain not started, and are **not** attempted
here as out of a single bounded round's scope:

- (b) naming a specific place in the place-fixture corpus text so the
  place-question `retrieval_miss` gap can be re-diagnosed — deferred
  because actually diagnosing it needs a real model re-run, which this
  round did not have separate authorization to spend on.
- (c) logging raw model responses on `MODEL_OUTPUT_INVALID` — deferred
  because `MODEL_OUTPUT_INVALID` handling lives in the shared, widely-used
  `provider-protocol.ts` (used by every task on the model gateway, not
  just `wiki_search_v1`), and a properly scoped fix needs its own
  dedicated round rather than being folded into this one.

#360 remains OPEN. VPJ-76's acceptance criteria were already all
structurally built per the round-20 handoff; this round is a scoped
tuning improvement to acceptance criterion #6 ("调参"), not new
end-to-end acceptance evidence — the ticket's own final line ("iOS/Web实际读回...通过后才完成本票")
still requires a live provider credential in a real deployment, which no
environment has configured.
