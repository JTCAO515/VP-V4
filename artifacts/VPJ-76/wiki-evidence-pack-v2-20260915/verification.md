# #360 (VPJ-76) verification — slice 10, EvidencePack v2

## What this slice implements

VPJ-76's own acceptance criteria (`docs/program/2026-09-05/issue-bodies/VPJ-76.md`)
requires: "EvidencePack记录required/background/missing/conflicts及
statement/publication/source/span和检索/ontology版本；关键遗漏、错误引用和
证据充足时全拒答均判失败，不由相关度决定完整性。" Slices 1-9 shipped a
much simpler shape (`summary`/`citations`/`gaps`) that satisfied none of
this structurally. This slice adds the real, required schema.

## The key design decision: completeness is computed, not self-reported

The acceptance criteria's own words -- "不由相关度决定完整性" (completeness
is not decided by relevance) -- rule out trusting the model's own claim
that it answered fully. `buildEvidencePack`
(`lib/server/knowledge/wiki/evidence-pack.ts`) instead decides each
required claim's `status` in code: a citation "covers" a claim only when
its underlying published statement's real `{predicate, objectId}` (read
from `knowledge_read_v1`, never from the model) matches that claim's own
triple -- the exact check `grounded-turn/1`'s resolver already uses for
its own, stricter, claims-coverage gate. The model still decides *what*
to cite and quote; code decides whether that citation actually closes a
required obligation.

This needed real provenance the pipeline had always thrown away:
`knowledge_read_v1` (`supabase/migrations/20260912042452_vpj_15_knowledge_publication.sql`)
has always returned `assertionId`, `assertion.{predicate,objectId}` and
`sources[].sourceRevisionId` per statement; `published-corpus.ts`
previously kept only `factId`/`text` for the lexical search primitive.
It now also returns a `provenance` map (statementId → 
predicate/objectId/publicationId/sourceIds) alongside the search
entries -- read from the same already-authorized response, nothing new
fetched or exposed.

## What was built

- `published-corpus.ts`: `PublishedCorpusOutcome`'s `kind:"corpus"` case
  gains `provenance: ReadonlyMap<string, StatementProvenance>`. A
  statement missing `assertionId`/`assertion.{predicate,objectId}`/
  `sources` is now rejected wholesale (matching this module's existing
  "never silently reshape" discipline), not kept searchable without
  provenance.
- `lib/server/knowledge/wiki/evidence-pack.ts` (new): `EvidencePack`
  (`schemaVersion: "evidence-pack/2"`) with `required` (one entry per
  `questionDefinition().claims`, `status: "covered"|"unresolved"`, real
  `refs`), `background` (citations matching no required claim),
  `missing`/`conflicts` (the model's own gaps/conflicts, passed through
  verbatim, never invented here), `retrievalVersion`
  (`WIKI_SEARCH_PROMPT_REF.version`, already existed), `ontologyVersion`
  (new `QUESTION_ONTOLOGY_VERSION = "questions/1"` constant in
  `questions.ts`), and `safeTraceId` (a fresh `randomUUID()` per pack --
  a correlation id, never derived from or carrying any private source
  text).
- `wiki-search.ts` (prompt + schema): the model's answer schema gains a
  `conflicts` field, split out from `gaps` -- the system prompt no longer
  tells the model to fold a disagreement between results into a gap;
  disagreements go in `conflicts`, missing coverage stays in `gaps`. This
  is the other acceptance-criteria bucket ("conflicts") that genuinely
  needs the model's own judgement (code cannot detect that two cited
  passages contradict each other) and so stays model-reported, unlike
  `required`'s coverage decision.
- `wiki-search-job.ts` / `grounded-search.ts`: `conflicts` flows through
  `WikiSearchJobOutcome` and `GroundedSearchOutcome`'s "answered" variant
  (flat, alongside the existing `gaps`) into `evidence.conflicts`. Place
  questions (`place_address`/`place_opening_hours`/
  `place_address_and_hours`) get `evidence.required: []` -- unchanged
  from slice 6's own decision that this module never resolves a
  placeSubjectId, so no fixed claim set exists to check coverage against;
  their citations land in `background` instead of being force-fit into a
  fabricated `required` entry.
- **Additive, not a breaking rewrite of already-shipped consumers**:
  `summary`/`citations`/`gaps` stay exactly as slices 7-9 shipped them
  (what `SavedAnswers.tsx` and `NativeAskView.swift` already render);
  `evidence` and the flat `conflicts` field are new. Web (`SavedAnswers.tsx`)
  and iOS (`NativeAskView.swift`) both gained a small additive
  "Search results disagreed" section rendering `conflicts`, matching the
  existing "Not covered by this search" (`gaps`) section -- the fuller
  `evidence.required`/`background`/versions/`safeTraceId` structure is
  not rendered in either UI (it is for a future evaluation harness/audit
  trail, not end-user display).

## What was verified

- `tests/contract/knowledge/wiki-evidence-pack.test.mjs` (new, 6 cases):
  a citation covering a required claim with full real provenance; a
  citation matching no claim landing in `background`, not silently
  dropped or miscounted; a citation with unknown provenance (never
  returned by the real corpus) excluded rather than fabricated; empty
  `required` when there are no claims; `missing`/`conflicts` passed
  through verbatim; `retrievalVersion`/`ontologyVersion` are the repo's
  real constants and `safeTraceId` is fresh and random per pack.
- `wiki-grounded-search.test.mjs`: the existing "real published statement
  flows through" test now also asserts the real, end-to-end
  `evidence.required[0]` is `status: "covered"` with the real
  `publicationId`/`sourceIds`/`span`; a new test confirms a place-question
  answer's `evidence.required` stays empty (never fabricated) while its
  citation still lands in `background`.
- `wiki-published-corpus.test.mjs`: the real-statement test now also
  asserts the returned `provenance` Map's exact contents; four new
  malformed-response cases (missing `assertionId`, incomplete `assertion`,
  empty `sources`, an empty `sourceRevisionId`) are all rejected wholesale.
- `node scripts/run-ci-suite.mjs contract` — 453/453 pass (446 existing +
  6 new EvidencePack tests + 1 new place-question test), no regressions.
- `pnpm lint` / `pnpm typecheck` — clean.
- **Real iOS compilation and a real, run-to-completion test pass**:
  `scripts/ios/ci.py` run locally end to end (build → build-for-testing →
  ad-hoc signature verification → an owned fresh simulator →
  `test-without-building` against the entire shared scheme → cleanup).
  Every step exited 0. `VisePandaTests`: 51/51 passed (6 skipped).
  `VisePandaUITests`: 25/25 passed (17 skipped, real network-gated
  suites) -- confirms the additive `conflicts` rendering in
  `NativeAskView.swift`/`NativeAskModels.swift` introduced no regression.

## What was NOT verified

- **No real model call.** `conflicts` is a new field the model must
  actually populate correctly (distinguishing a genuine disagreement from
  ordinary missing coverage) -- this was validated only against
  fixture/test transport, the same posture every other slice in this
  thread has been honest about for the parts requiring a live provider
  credential (none configured in any environment).
- **No real published statement in production has been read through this
  new provenance path yet** -- verified against the real RPC's actual SQL
  shape (read directly from the migration) and matching test fixtures,
  not against a live database with real publications.
