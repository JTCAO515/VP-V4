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
- **EvidencePack v2 schema** (required/background/missing/conflicts,
  statement/publication/source/span, retrieval/ontology version, reason
  code, safe trace ID) — not built; current `citations`/`gaps`/`coverage`
  is intentionally smaller.
- **Frozen zh/en question-family/qrels evaluation set** — VPJ-76's own
  required acceptance step, not started.

#360 remains OPEN. The retrieval/loop mechanism, real product-knowledge
connection, intent→search glue, the required six-way reason taxonomy, and
a real research-knowledge connection all exist and are tested; both Web
and iOS now have real, database-verified/real-XCTest-verified trigger
paths (slices 8 and 9), though no deployment has wired a live model
credential to either yet, and evaluation work that VPJ-76 requires for
closure has not started.
