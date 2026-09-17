# VPJ-76 (#360) — explicitly UNRUN

First slice (agentic search loop mechanism) — see
`wiki-agentic-search-20260915/verification.md` and
`docs/contracts/wiki-agentic-search.md`.

- ~~Round-based agentic search loop mechanism~~ **DONE.** `runWikiSearchJob`
  correctly bounds rounds via `CostGuard`, detects and reports both exact
  duplicate queries and rephrased-but-no-new-evidence queries without
  re-searching, tells the model explicitly when it's on the final round,
  accumulates usage, and returns a closed-schema outcome. Fixture-verified
  and now also real-model-verified (below).
- ~~Real model call~~ **REAL EVIDENCE, both original findings fixed and
  re-verified.** See `wiki-real-model-probe-20260915/verification.md` and
  `wiki-search-convergence-20260915/verification.md`. Original probe: 1
  real success out of 4 real GLM-5.3-flash runs (Qwen unreachable from
  this sandbox -- network allowlist; DeepSeek failed on a stale configured
  model id, `MODEL_PROFILES.deepseek_flash.providerModelId`, flagged
  separately, not fixed here) -- one English question answered correctly;
  two Chinese questions both `budget_exhausted`, exposing two real bugs:
  (1) this loop's duplicate detection only caught exact-string repeats,
  not a model rephrasing its query every round, and (2) `search-index.ts`'s
  CJK tokenization was broken (whitespace-split on text with no
  whitespace), so Chinese retrieval silently returned nothing regardless
  of (1). Both fixed; the same two Chinese questions that originally
  failed now both converge to a real, honest answer (`partial` with real
  verbatim citations; `no_content` with an honest "nothing found," not a
  fabrication) within the round budget. VPJ-76's "at least one zh/en
  answered/partial pair" is now met on both sides by real evidence.
- ~~Connection to real published Wiki content~~ **DONE for the product
  path.** `buildPublishedWikiCorpus` (`lib/server/knowledge/wiki/published-corpus.ts`)
  turns a real `knowledge_read_v1` response into a search corpus, reusing
  that RPC's existing eligibility filtering (published/not-expired/
  reviewed) rather than adding a second read path. Still missing: the
  caller must already know which `{city, scene, locale}` to ask for --
  there is no free-text "identify the object/city/scene" step yet (that
  is intent recognition, out of scope here).
- ~~Research-index-vs-product-index separation~~ **DONE.**
  `buildResearchWikiCorpus` (`lib/server/knowledge/wiki/research-corpus.ts`)
  reads the same underlying pages through the existing Ops-only
  `ops_wiki_read_v1` RPC instead of `knowledge_read_v1` -- draft/
  unpublished/rejected content included, gated by that RPC's own
  `current_actor()` Ops-membership check, not a UI label. No new
  migration/RPC; reuses what VPJ-75 slice 3 already built for `/ops/wiki`.
  Not yet wired to `runGroundedWikiSearch` or exposed anywhere an operator
  could actually trigger a research search -- this is the corpus adapter
  only.
- ~~Ask-path integration~~ **DONE at the database level (slice 7).**
  `public.read_grounded_ai_assist_context_v1` (new migration) is a real,
  database-verified integration point into `grounded-turn/1`: it reuses
  `read_grounded_turn()`'s exact owner/session/policy authorization chain
  and only returns real context when the fixed-claims resolver's own
  `original_outcome` is genuinely `'blocked'` -- never as a bypass of an
  answered/partial result. Verified against a real Postgres instance (56
  migrations, a full real submit→claim→authorize→complete round trip)
  that this gate holds for both a real blocked turn and a real
  non-blocked one (`clarification`), and that a non-owner gets nothing.
  `runGroundedAiAssist` (`lib/server/knowledge/wiki/grounded-ai-assist.ts`)
  calls that RPC and hands off to `runGroundedWikiSearch`.
- ~~Web UI wiring~~ **DONE (slice 8).** See
  `wiki-grounded-ai-assist-web-20260915/verification.md`. A durable,
  owner-scoped, pull-driven job (`turn_private.grounded_ai_assist_jobs` +
  `public.grounded_ai_assist_work_v1`, fenced by `claim_token` exactly
  like VPJ-75's job reclaim) plus a cookie-authenticated Web route
  (`app/api/chat/grounded/ai-assist/route.ts`) and a button in
  `SavedAnswers.tsx` that appears only under a `blocked`-family notice,
  polls to a terminal status, and renders the result with an explicit
  "AI-generated, not reviewed" disclaimer. 10 real-database scenarios
  verified: claim, concurrent-poller pending, non-owner denial, wrong-
  and correct-claimToken completion, a forced stale reclaim with a fresh
  fencing token and the old token's late completion rejected, a real
  non-blocked turn never creating a job row, and Ops membership granting
  no special access. The route's env-based provider gate
  (`VISEPANDA_GROUNDED_AI_ASSIST` + provider/credential env vars) is
  unset in every environment -- no deployment has wired a live model
  credential to this path yet, matching every other real-model call in
  this codebase. Not persisted by design, unchanged from slice 7.
- ~~iOS wiring~~ **DONE (slice 9).** See
  `wiki-grounded-ai-assist-ios-20260915/verification.md`. Same job as
  slice 8, reached over the app's separate Bearer/native-session identity
  (`nativeGroundedAiAssist`, copying `nativeGroundedEvents`'s exact auth
  pattern) instead of the Web cookie session. `NativeAskStore.runAiAssist`
  polls outside the store's single `busy` operation slot (like
  `receiveEvents` already does) so it never freezes other Ask actions; a
  SwiftUI panel appears only under `originalOutcome == "blocked"`, always
  disclosed as AI-generated and unreviewed. Verified by a real,
  run-to-completion XCTest pass in this session's own sandbox (after JT
  switched `xcode-select` to full Xcode and accepted its license): the
  first "BUILD SUCCEEDED" was a false positive (the new test file was
  never actually registered in `project.pbxproj`'s `VisePandaTests`
  target, so the compiler never saw it -- caught by "Executed 0 tests"
  once the sandbox's CoreSimulator self-recovered from an initial version
  mismatch), fixed alongside a second real bug (missing `@MainActor` on
  the test methods). After both fixes, 5/5 new tests and 51/51 (6 skipped)
  of the full existing suite passed for real on a booted simulator.
- ~~Place question support~~ **DONE.** See
  `wiki-place-questions-20260915/verification.md`.
  `place_address`/`place_opening_hours`/`place_address_and_hours` route
  directly to `scene: "attraction"` -- `questionDefinition()` only needs a
  resolved `placeSubjectId` (from VPJ-19 place disambiguation, still not
  performed anywhere in this session's work) to build its `claims` array
  for `grounded-turn/1`'s stricter per-subject checks, a value this module
  never reads. The search loop finds relevant content itself rather than
  requiring it be pre-identified, so no place disambiguation was actually
  needed for this consumer. `grounded-turn/1`'s own claims-coverage path
  is unchanged and still needs a resolved subject.
- ~~Full reason-code taxonomy~~ **DONE.** `GroundedSearchOutcome`'s
  `unavailable` kind carries exactly one of VPJ-76's required
  `missing_content`/`retrieval_miss`/`user_input_missing`/
  `capability_unsupported`/`policy_denied`/`provider_failure`. Notably:
  `clarification` → `user_input_missing` (the traveler's own input was
  insufficient) is distinguished from `unsupported` →
  `capability_unsupported` (this capability doesn't cover that question
  kind at all; place questions no longer fall in this bucket -- see
  below); "no published content exists" (`missing_content`) is
  distinguished from "content exists but the search loop found nothing
  relevant" (`retrieval_miss`, when the loop's own `coverage` comes back
  `no_content`). `budget_exhausted` and `cancelled` stay their own
  terminal kinds rather than being force-fit into one of the six --
  they're process outcomes, not failure reasons.
- ~~EvidencePack v2 schema~~ **DONE (slice 10).** See
  `wiki-evidence-pack-v2-20260915/verification.md`. New
  `lib/server/knowledge/wiki/evidence-pack.ts`: `required` (per-claim
  `covered`/`unresolved`, decided in code by matching a citation's real
  published `{predicate,objectId}` against the claim's own triple, never
  by the model's self-report), `background` (citations matching no
  required claim), `missing`/`conflicts` (the model's own gaps/conflicts,
  now a first-class field split out of the previous overloaded `gaps`),
  `statement`/`publication`/`source`/`span` refs (real `factId`/
  `assertionId`/`sourceRevisionId`s/quote, read from fields
  `knowledge_read_v1` always returned but `published-corpus.ts`
  previously discarded), `retrievalVersion`/`ontologyVersion`, and a
  fresh `safeTraceId` per pack. Additive to the already-shipped
  `summary`/`citations`/`gaps` (Web/iOS keep rendering those unchanged);
  `evidence` and a flat `conflicts` field are new on
  `GroundedSearchOutcome`'s "answered" variant. Place questions'
  `evidence.required` stays empty (unchanged from slice 6's decision that
  this module never resolves a placeSubjectId) rather than fabricating
  coverage. 453/453 contract suite; iOS verified with a real,
  run-to-completion run of `scripts/ios/ci.py` (51/51 + 25/25 tests, both
  at existing skip counts).
- ~~Frozen zh/en question-family/qrels evaluation set~~ **DONE (slice 11).**
  See `wiki-frozen-eval-20260915/verification.md`. New
  `evals/wiki-agentic-search/`: 34 scenarios (one zh + one en per real
  `QUESTION_DEFINITIONS`/`PLACE_QUESTION_IDS` entry, plus 6 diversity
  cases covering every non-gate terminal), `development`/`holdout` split
  17/17, claim ground truth imported directly from `questions.ts` (never
  re-typed). Runs the real `runGroundedWikiSearch` against a fixture
  RPC/model transport and writes a report every run. Real fixture-mode
  run: 34/34 matched ground truth, 90.9% coverage, 9.1% over-refusal (3
  deliberately constructed divergence cases against the
  structured/direct-lookup baseline: `retrieval_miss` and
  `budget_exhausted`, the two terminals where a correctly-scoped corpus
  existed yet the agentic path did not answer from it). Deliberately
  fixture-only this slice (no real model call, no real database) — JT's
  own choice, to avoid spending the configured API key budget without a
  separate explicit go-ahead. Does not claim to establish `AI-42`'s
  general qrels infrastructure (out of scope per `evals/qrels/README.md`,
  `evals/runners/README.md`).

- ~~A real-model pass over the frozen evaluation set~~ **DONE
  (2026-09-16).** JT authorized it explicitly. Real GLM run: 65.6%
  accuracy (21/32; `provider_failure`/`budget_exhausted` skipped as
  mechanism-only). Two real script bugs caught and fixed before the batch
  ran (a missing `rpc` in `deps`, a citation-quote `.trim()` gap).
  Root-caused every mismatch: 1 is this eval's own scenario-design bug
  (fixed in the same follow-up), 2 are the pipeline correctly degrading
  to `provider_failure` on non-conformant real model output (the safety
  property the closed schema exists to guarantee, not a defect), 3 are
  multi-claim questions not fully covered within `maxRounds: 2` (real,
  honest partial answers -- a tuning signal, not a defect), 4 are
  place-question `retrieval_miss` results this run could not fully
  explain (flagged genuinely unresolved -- `retrieval_miss` deliberately
  strips rounds/queries by design, so this run cannot reconstruct why).
  Not once did real model imperfection cause a fabricated answer, a
  crash, or a taxonomy bypass. Full detail:
  `wiki-frozen-eval-real-model-20260916/verification.md`.

## Decisions (2026-09-16, JT delegated: "第二件事你来决定。#360你来决定，后续的方向你来决定")

**Persistence of the AI-assisted result: staying real-time/non-persisted,
unchanged from slice 7's own decision.** The real-model pass's 65.6%
accuracy and four genuinely unresolved place-question mismatches are
direct evidence against building user-facing persisted history for this
feature right now -- doing so would present a real, lower-confidence,
partially-unexplained result with the same permanence as the reviewed
answer it supplements, contradicting the whole feature's own design
principle (real-time, heavily disclaimed, explicitly "AI-generated, not
reviewed"). The existing job row (`grounded_ai_assist_jobs`) already
retains a result for the lifetime of that row, which is all the current
poll-driven mechanism needs; no new persistence surface is being added.

**#360: staying OPEN, not recommended for closure yet.** VPJ-76's
acceptance criteria are all structurally built and evidenced, but its own
final line requires "iOS/Web实际读回...通过后才完成本票" -- and no
environment has a live provider credential configured (every slice from
7 through 11 says so honestly), so no one has actually read back a real
AI-assisted answer through the real product UI end to end. Combined with
the real-model pass's own accuracy gap, closing #360 now would overstate
readiness. Recommended before closure: (1) configure a live provider
credential in a real deployment and confirm one real end-to-end readback
through Web and iOS, (2) decide, as an operator/product call rather than
an engineering one, whether 65.6% real accuracy is acceptable to expose
in production as-is or needs the tuning work below first.

**Recommended follow-up work:** (a) tune `maxRounds` relative to a
question's required-claim count (category 3 above), (b) name the specific
place in the place-fixture corpus text so the place-question retrieval gap
(category 4) can be re-tested and actually diagnosed, (c) log raw model
responses on `MODEL_OUTPUT_INVALID` for real diagnosability (a gap this
very pass hit and noted).

- ~~(a) tune `maxRounds` relative to a question's required-claim
  count~~ **DONE 2026-09-17.** See
  `tuned-max-rounds-20260917/verification.md` and
  `docs/contracts/wiki-agentic-search.md`'s matching dated entry. A new
  pure `tunedMaxRounds` function in `grounded-search.ts` raises the
  round-budget floor to `requiredClaimCount + 1` (capped at
  `wiki-search-job.ts`'s own hard bound of 6), applied internally so
  every existing caller (Web/iOS production routes, both real-model eval
  scripts) inherits it without its own edit. Verified end to end against
  the real `runGroundedWikiSearch`/`runWikiSearchJob` code path with a
  scripted transport (a 4-claim question now gets 5 real model-call
  attempts before `budget_exhausted`, up from 2; a 1-claim question is
  provably unchanged at 2). The frozen eval's own fixture-mode metrics
  are numerically unchanged (its one `budget_exhausted` scenario is a
  place question, unaffected by design). **Not verified:** whether this
  actually raises real-model accuracy on the frozen set -- that needs a
  real GLM re-run, not separately authorized this round.
- ~~(b) name the specific place in the place-fixture corpus text so the
  place-question retrieval gap (category 4) can be re-tested and
  actually diagnosed~~ **DONE 2026-09-17 (round 24).** See
  `wiki-agentic-search-place-fixture-real-model-20260917/verification.md`
  and `docs/contracts/wiki-agentic-search.md`'s matching dated entry.
  `evals/wiki-agentic-search/cases.ts` bumped to `versions.corpus:
  "wiki-agentic-search-eval/2"`: the three place-question `QUESTION_TEXT`
  entries and the `place_address`/`opening_hours` `STATEMENT_TEXT`
  entries now consistently name a synthetic attraction, "Cloudscape
  Pavilion" / 云境阁, instead of the generic "the named attraction" /
  "这个景点" placeholder that appeared nowhere else in the fixture text
  either. Re-verified real-model: a fresh real Qwen (`qwen3.7-plus-2026-05-26`)
  run over the frozen set now gets **6/6 place-question scenarios right**
  (up from 2/6 real-GLM in the 2026-09-16 pass) -- the specific category-4
  gap this item named is closed. Not a controlled single-variable
  comparison (provider changed too, GLM→Qwen, because GLM's configured
  key now has zero real balance -- see that verification.md for the fresh
  balance check); still real, direct evidence the fixture's missing place
  name was at minimum *a* real contributor, matching hypothesis (a) from
  the 2026-09-16 write-up. Fixture-mode test
  (`wiki-agentic-search.evals.test.ts`) re-run after the edit: still
  34/34 PASS, confirming the fixture-content change is fully backward
  compatible with the deterministic scripted-transport pass.
- ~~(c) log raw model responses on `MODEL_OUTPUT_INVALID` for real
  diagnosability~~ **PARTIALLY DONE 2026-09-17 (round 24), script layer
  only.** `scripts/eval/run-wiki-agentic-place-fixture-real-model.mjs`
  (the same round-24 real-model script above) wraps `deps.fetch` with a
  capturing wrapper (the same pattern
  `run-wiki-statement-proposals-injection-real-model.mjs` already
  established in round 22) so every row in this run's own `results.json`
  carries `rawResponseStatus`/`rawResponseText` -- the real HTTP response
  this run actually received, usable to diagnose a `MODEL_OUTPUT_INVALID`
  row directly instead of guessing. This round's real run happened to hit
  zero `MODEL_OUTPUT_INVALID` outcomes (every mismatch was a
  `retrieval_miss` or an honestly-partial `answered`, not a schema
  rejection), so this capture has not yet been exercised against a real
  invalid-output row -- the mechanism is proven working (it captured a
  real 200 response body for every one of the 32 scenarios run), not yet
  proven against the specific failure mode it was built for. **Not
  done:** making this logging a property of `provider-protocol.ts`
  itself (the shared module every production/eval caller goes through) --
  unrun.md's own original phrasing flagged that as needing separate,
  careful review before touching a module this many call sites share,
  and this round did not attempt it. A future round wanting raw-response
  diagnosability inside the actual product path (not just this one
  script) still needs that separate, careful pass.
