# VPJ-76 (#360) — agentic search over published Wiki content, first slice

Status: core loop mechanism implemented and verified with an injected
transport (fixture model, no real provider call, no real Staging). Real
model semantic quality, real Ask-path integration, and iOS/Web readback
are separate, later work — see "What this slice deliberately does not do".

Per JT's 2026-09-15 direction: VP's knowledge architecture is RAG (agentic
search) + LLM Wiki + Ontology. This is the first slice of the RAG/agentic
search layer, distinct from and building on the LLM Wiki layer (VPJ-74/75,
already merged) and the Ontology layer (VPJ-74).

## Why a round-based loop, not native multi-turn tool calling

This codebase's model protocol (`invokeProviderProtocol` in
`lib/server/model-gateway/adapters/provider-protocol.ts`) has no concept of
an assistant tool-call result being fed back into the same conversation —
every existing task type is one request, one closed-schema JSON response.
Extending the protocol to carry an OpenAI-style
`assistant(tool_call) → tool(result) → assistant(...)` history would be a
much larger, riskier change to a heavily-used shared module.

Instead, each search round is an independent `invokeProviderProtocol` call
sharing one `CostGuard` turn (so `maxModelSteps` bounds total rounds, not
just one call). The full transcript-so-far (question, prior queries,
prior results, which queries were duplicates) is serialized into that
round's `input` string. This achieves the same agentic behavior — the
model decides whether to search again, what to search for, and when it
has enough to answer — without touching the shared protocol's history
mechanism.

## Contract

New protocol task `wiki_search_v1`
(`lib/server/model-gateway/prompt/wiki-search.ts`): the model returns
exactly one of:
- `{"action":"search","query":"..."}` — 1-200 units, in the language most
  findable for the term.
- `{"action":"answer","coverage":"answered"|"partial"|"no_content","summary":"...","citations":[...],"gaps":[...]}`.
  `no_content` must carry zero citations; `answered`/`partial` must carry
  at least one. Every citation names an exact `pageKey` and a short quote.

Retrieval primitive (`lib/server/knowledge/wiki/search-index.ts`,
`searchWikiCorpus`): a deliberately simple, deterministic lexical scorer
(bag-of-words overlap + an exact-phrase bonus) over a caller-supplied
corpus of already-published Wiki text. **Not** the #248 hybrid/RRF path
(`lib/server/knowledge/retrieval/hybrid`) and **not** the place-name
lexical baseline (`lib/server/knowledge/retrieval/lexical`) — those score
different units (facts, entities) for different purposes. This is a
separate, smaller primitive; whether it should be replaced by real hybrid
retrieval stays #248's own activation-gated decision, unaffected by this
slice existing.

Loop (`lib/server/jobs/wiki-search-job.ts`, `runWikiSearchJob`): runs up to
`maxRounds` (1-6) rounds. A query identical (case-insensitively) to an
earlier one in the same run triggers no new search — the model is told
in the next prompt that it was a duplicate, so it can pick a different
angle or answer with what it has, rather than the loop silently repeating
the same lexical lookup forever. Reaching `maxRounds` without an `answer`
returns `budget_exhausted`. Token usage is accumulated across every real
model call in the run, not just the last one.

## Slice 2 (2026-09-15): real published-knowledge corpus

`lib/server/knowledge/wiki/published-corpus.ts`, `buildPublishedWikiCorpus`:
adapts a real `knowledge_read_v1` response into a `WikiSearchCorpusEntry[]`
the loop can search. Deliberately reuses that existing, already-authorized
RPC rather than adding a second read path against publication tables --
every eligibility check (`published`, not expired, `reviewed`), the
authentication requirement, and the `{city, scene, locale}` scope
filtering stay exactly where they already are, enforced by that RPC's own
SQL. This module only reshapes an already-filtered response (folding each
statement's `conditions`/`exclusions` into its searchable text) and
validates its shape defensively -- it grants no new access and repeats no
eligibility logic of its own.

This still requires the caller to already know which `{city, scene,
locale}` to ask for. Identifying that from a free-text question is intent
recognition (the existing `knowledge_intent_v1` path) and is not built
here. (Slice 5, below, is what actually adds the research-side counterpart
to this product-side corpus.)

## Slice 3 (2026-09-15): intent → scene → corpus → search glue

`lib/server/knowledge/wiki/grounded-search.ts`, `runGroundedWikiSearch`:
takes an already-recognized `KnowledgeIntent` (from the existing
`knowledge_intent_v1` path -- not re-implemented here) plus a `city`
(from existing Trip context -- never free-text-recognized) and drives the
full chain: `questionDefinition(intent)` → scene → `buildPublishedWikiCorpus`
→ short-circuit if nothing is published (no wasted model call) →
`runWikiSearchJob`. (Slice 4, below, is what actually names these
outcomes with VPJ-76's required reason codes.)

(Slice 6, below, is what actually makes place questions work -- as
originally written here, they were treated as unsupported.)

This is glue, not wiring: nothing in `grounded-turn/1`, the durable text
worker, iOS, or the Web reader calls `runGroundedWikiSearch` yet. That
integration is the next slice.

## Slice 4 (2026-09-15): the required six-way reason taxonomy

`GroundedSearchOutcome` now has exactly four top-level kinds: `answered`,
`unavailable` (carrying `reason: missing_content | retrieval_miss |
user_input_missing | capability_unsupported | policy_denied |
provider_failure`), `budget_exhausted`, and `cancelled`. This replaces
slice 3's ad-hoc `unsupported_intent`/`no_content`/`corpus_unavailable`
kinds — a deliberate breaking change to a type this session introduced,
with no real caller yet to break.

Mapping decisions, and why:
- `intent.intent === "clarification"` → `user_input_missing`. The
  traveler's own question didn't give the intent classifier enough to
  work with.
- Any other unrecognized intent (`unsupported`) → `capability_unsupported`.
  This capability doesn't cover that kind of question at all -- a
  different reason from the traveler needing to say more. (Place
  questions are handled separately -- see slice 6 -- and no longer fall
  into this bucket.)
- Empty corpus (`buildPublishedWikiCorpus` returns zero entries) →
  `missing_content`. Nothing has ever been published for this scope.
- The search loop actually ran, over a *non-empty* corpus, but returned
  `coverage: "no_content"` → `retrieval_miss`, not `missing_content`.
  Content exists; the loop didn't find anything relevant to this specific
  question. This is the one case where an `answered`-shaped loop outcome
  gets reclassified rather than passed through, since an empty-citation
  "answer" isn't a real answer.
- `knowledge_read_v1` returning the specific error `KNOWLEDGE_DISABLED` →
  `policy_denied` (an operator switch, not a fault). Any other RPC error
  or thrown exception → `provider_failure`.
- A `failed` loop outcome (provider HTTP failure, malformed model output)
  → `provider_failure`, with the underlying `errorCode` preserved as
  `providerCode`.
- `budget_exhausted` and `cancelled` are **not** folded into the six --
  they're process outcomes (ran out of rounds; caller aborted), not
  reasons a question can't be answered, and VPJ-76's taxonomy doesn't
  claim to be exhaustive over every possible terminal state, only to keep
  the six failure reasons themselves distinct.

## Slice 5 (2026-09-15): research-index counterpart

`lib/server/knowledge/wiki/research-corpus.ts`, `buildResearchWikiCorpus`:
the research-side counterpart to slice 2's product-side
`buildPublishedWikiCorpus`, completing "一套知识，两个检索用途" (one set of
knowledge, two retrieval purposes) from `docs/knowledge-upgrade/README.md`.
Reads the same underlying pages through the existing Ops-only
`ops_wiki_read_v1` RPC (VPJ-75 slice 3, already used by `/ops/wiki`)
instead of `knowledge_read_v1` -- draft/unpublished/rejected content
included, gated by that RPC's own `current_actor()` Ops-membership check,
not a UI label. No new migration/RPC. Two calls per page (list, then each
page's detail, since the list mode intentionally omits `draftContent`) --
acceptable at the current small page count, not optimized here.

Not yet wired to `runGroundedWikiSearch` or exposed anywhere an operator
could actually trigger a research search -- this is the corpus adapter
only, same status slice 2's product corpus had before slice 3 wired it up.

## Real model probe (2026-09-15, after slice 5)

Not a numbered slice (no code changed in the product path -- the probe
used a raised `maxOutputTokens` parameter, not a new default). JT supplied
real Qwen/DeepSeek/GLM API keys for this. Full detail:
`artifacts/VPJ-76/wiki-real-model-probe-20260915/verification.md`.

Headline results:
- **Qwen unreachable from this sandbox** -- `dashscope.aliyuncs.com` is not
  on this environment's outbound network allowlist (TLS handshake fails
  even through the configured proxy). DeepSeek and GLM domains are
  reachable.
- **Real finding: `MODEL_PROFILES.deepseek_flash.providerModelId`
  (`lib/server/model-gateway/index.ts`) is stale.** A real DeepSeek call
  with the configured `"deepseek-v4-flash"` succeeds, but the response's
  own `model` field comes back `"deepseek-flash"` -- correctly rejected by
  `normalizeResponse`'s exact-match check. Not fixed here: that constant is
  shared well beyond `wiki_search_v1`, changing it is outside this slice's
  scope based on one probe. Flagged for a maintainer to confirm separately.
- **Real finding: GLM-5.3-flash needs a much larger `maxOutputTokens` than
  this slice's fixture tests happened to use.** At `400`, GLM's own
  `reasoning_content` (observed up to 399 tokens) consumed the entire
  budget before emitting any of the required JSON, producing
  `finish_reason: "length"` and an empty `content` -- indistinguishable
  from a protocol failure unless you look at the raw response. This
  sharpens the known GLM-thinking issue already recorded in
  `wiki-generation-dispatch.md`. **Caller guidance, not a code change:**
  a real GLM caller of this search loop should budget `maxOutputTokens`
  generously (2000 worked; 400 did not) to leave room for GLM's mandatory
  reasoning output.
- **Real end-to-end success at `maxOutputTokens: 2000`** (English): GLM
  searched (round 1), then answered from the real retrieved passage
  (round 2) with accurate `summary`, verbatim-verified `citations`, and a
  genuine (non-hallucinated) `gaps` entry. First non-fixture evidence that
  the `wiki_search_v1` prompt contract is actually followable by a real
  model.
- **Real finding: two Chinese real runs both exhausted their round budget
  without ever answering** -- the model kept rephrasing its query each
  round (different wording, same intent) rather than answering from
  already-sufficient evidence or hitting this loop's exact-string
  duplicate-detection. A real, reproducible quality gap, not a protocol
  failure -- distinct from findings #1/#2 above. Full detail and the exact
  queries issued: `wiki-real-model-probe-20260915/verification.md`.
- **Net read: 1 real success out of 4 real runs (English only).** Real,
  not fixture, evidence -- but neither "the loop works" nor "it doesn't"
  is the honest summary; both the success and the two exhaustions are real
  and both matter. VPJ-76's "at least one zh/en answered/partial pair"
  requirement is met on the English side, not yet on the Chinese side, by
  this session's real evidence. No adversarial input, no multi-relevant-
  source scenario, and no real published-Wiki content (still a
  hand-written fixture corpus) has been tried.

## Current overall status (as of slice 5 + the real model probe)

What exists and is fixture-tested: the search loop (slice 1), a real
product-knowledge corpus adapter (slice 2), the intent-to-search glue
(slice 3), VPJ-76's required six-way reason taxonomy (slice 4), and a
research-knowledge corpus adapter (slice 5). The loop's core prompt
contract has now also been exercised once, successfully, against a real
model (above).

What's still not done, in roughly the order a next slice would tackle it:
- **Real LLM verification is a single anecdote, not a benchmark.** See
  above -- one English question, one provider that actually worked (GLM),
  Qwen untested (unreachable), DeepSeek untested (stale model id).
- **The research corpus (slice 5) isn't connected to anything.** Nothing
  calls `buildResearchWikiCorpus` + `runWikiSearchJob` together the way
  `runGroundedWikiSearch` does for the product path.
- **No actual wiring into any product or Ops surface** -- `grounded-turn/1`,
  the durable text worker, iOS, the Web reader, and `/ops/wiki` do not call
  any of this yet. VPJ-76's eventual acceptance needs a real zh/en round
  trip through an existing consumer.
- **No EvidencePack v2 schema** (required/background/missing/conflicts,
  statement/publication/source/span, retrieval/ontology version, safe
  trace ID) — `citations`/`gaps`/`coverage`/`reason` here are a smaller,
  first-cut shape. Do not treat this as the final EvidencePack — see
  `docs/knowledge-upgrade/README.md`'s "产品检索与 EvidencePack v2" section
  for the full target shape.
- **No frozen zh/en question-family or qrels evaluation set** — VPJ-76's
  own required acceptance step, not started.

## Search loop convergence + CJK retrieval fix (2026-09-15, after the real model probe)

Two real, distinct bugs the real model probe (above) found, both fixed
and both re-verified against a real model on the exact questions that
originally failed. Full detail:
`artifacts/VPJ-76/wiki-search-convergence-20260915/verification.md`.

- **Loop convergence** (`wiki-search-job.ts`): duplicate-query detection
  only caught an *exact* repeated query string. A real GLM probe kept
  rephrasing its Chinese query every round without ever repeating one
  verbatim, so the "stop and answer" signal never fired. Fixed by
  tracking which corpus pages have been surfaced across *all* rounds
  (`seenPageKeys`), independent of exact query matching -- a round that
  surfaces no page beyond what's already seen is now labeled distinctly
  from an exact duplicate, and the final round explicitly tells the model
  there's no round after it.
- **CJK retrieval** (`search-index.ts`): `tokenize()` used to
  `split(/\s+/)`. Chinese has no spaces, so an entire Chinese passage
  became one giant token that could never match a short query --
  independent of the loop bug, and it's why the *first* real retest of the
  loop fix still came back `no_content` on a question the corpus could
  answer. Fixed with adjacent-character bigram tokenization for CJK text
  (the same lightweight approach Lucene's `CJKAnalyzer` uses); the
  exact-phrase bonus stays English-only by design (documented, not
  silently broken).
- **Real re-verification**: the same two Chinese questions that hit
  `budget_exhausted` in the original probe now both converge to a real,
  honest answer (`partial` with 3 verbatim-verified citations and 2 honest
  gaps; `no_content` with an honest "nothing relevant found," not a
  fabricated or misapplied answer) within the round budget.
- Fixture regressions: `wiki-search-job.test.mjs` 12/12 (2 new),
  `wiki-search-index.test.mjs` 11/11 (4 new, including one that documents
  bigram overlap is intentionally coarse-grained, not eliminated).
  429/429 full contract suite, no regressions.

## Slice 6 (2026-09-15): place questions

Place questions (`place_address`/`place_opening_hours`/
`place_address_and_hours`) were `capability_unsupported` through slice 5,
reasoned as needing a resolved `placeSubjectId` from place disambiguation
(VPJ-19) -- true for `questionDefinition()`'s own claims-coverage path
(`grounded-turn/1`, a stricter, different consumer that constructs
per-subject assertions), but not actually true for this module:
`questionDefinition()` returns a **hardcoded** `scene: "attraction"` for
every place question regardless of `subjectId` -- it only *requires* one
to build its `claims` array, which `runGroundedWikiSearch` never uses.

So place questions are now supported directly: `isPlaceQuestionId(intent)`
routes straight to `scene: "attraction"`, bypassing
`questionDefinition()`'s subjectId requirement entirely. This works
*because* it's agentic search, not exact-match lookup: the loop finds
whichever published attraction content is actually relevant to the
traveler's question (which, in free text, already names the place) rather
than requiring the place be pre-resolved to a canonical ID before search
even starts.

## Slice 7 (2026-09-15): real grounded-turn/1 integration

The user-facing question this session had to answer before writing any
code: `grounded-turn/1`'s answer is never LLM-generated --
`resolve_question()` matches fixed `{subjectId,predicate,objectId}` claims
against published statements with zero generation, by design (see "Why a
round-based loop" at the top of this doc for the parallel decision about
the search loop itself; this is the analogous decision about the resolver
it now supplements). Introducing agentic search into that flow risks
introducing exactly the failure mode it was designed to prevent, unless
scoped very carefully. Three options were laid out, in increasing order of
risk:

1. **Supplement only when the fixed-claims resolver found nothing**
   (`original_outcome = 'blocked'`) -- never a bypass of an
   answered/partial result.
2. A parallel, independent free-text Ask channel.
3. Technical plumbing only, no UI.

JT chose (1). What got built:

- `public.read_grounded_ai_assist_context_v1(p_turn_id uuid)`
  (new migration): read-only, reuses `read_grounded_turn()`'s exact
  owner/session/policy authorization chain, and **refuses to return
  anything unless `original_outcome = 'blocked'`** -- the one real gate.
  Does not touch `resolve_question()` or
  `complete_selected_grounded_work()` at all.
- `lib/server/knowledge/wiki/grounded-ai-assist.ts`, `runGroundedAiAssist`:
  calls that RPC, builds a `GroundedSearchInput`, hands off to
  `runGroundedWikiSearch` (slices 1-6). Real-time, user-triggered,
  **not persisted** -- a deliberate scope cut for this slice, not a
  finished decision either way.

Verified against a **real database** (native PostgreSQL 16, all 56
migrations replayed, a full real `submit_grounded_turn` →
`claim_grounded_work` → `authorize_grounded_dispatch` →
`complete_grounded_work` round trip driven end to end): a real blocked
turn's owner gets real context back; a different actor gets nothing; a
second real turn with a real non-blocked outcome (`clarification`) gets
`not_applicable` -- the safety property this whole slice exists to
guarantee, proven against the real resolver's real judgement, not asserted
in a fixture. Full detail:
`artifacts/VPJ-76/wiki-grounded-turn-integration-20260915/verification.md`.

Not built: any UI/product caller (iOS, Web, the durable text worker),
persistence of the AI-assisted result.

## Slice 8 (2026-09-15): the real Web trigger

Slice 7 built the integration point but wired it to nothing -- no real
request could ever reach `runGroundedAiAssist`. JT asked to connect UI next
(iOS and/or Web), and settled two real decisions before any code was
written:

1. **Execution model**: queued + polling/SSE, not a single synchronous
   request. The agentic search loop can take several rounds and tens of
   seconds; holding one HTTP request open for that long risks a timeout
   and loses all progress on a dropped connection.
2. **Scope**: Web first, iOS as a deliberate follow-up -- the two clients
   need separate loading/error/copy design and shouldn't be built, and
   tested, in one pass.

**No cron or worker process exists anywhere in this codebase** (the one
exception, `lib/server/jobs/run-staging-text-worker.mjs`, is a manually
invoked local script). Rather than inventing one, this slice uses a
pull-driven job: whichever request first observes a job as claimable
(freshly created, or `running` past a 2-minute staleness window) claims it
and runs the search itself before responding. A concurrent second request
sees `pending` and polls again rather than double-running the search. This
reuses the exact `claim_token` fencing pattern VPJ-75 added for
`wiki_generation_jobs` (`supabase/migrations/20260915180000_vpj_75_wiki_job_reclaim.sql`):
a completion must present the exact token its own claim returned, so a
reclaimed-away attempt can never overwrite a fresher one.

What got built:

- `turn_private.grounded_ai_assist_jobs` (new migration): one row per
  turn, `status` in `queued|running|succeeded|failed|cancelled`,
  `claim_token`, `started_at`/`finished_at`, `outcome` jsonb.
- `public.grounded_ai_assist_work_v1(p_input jsonb)`: single dispatcher,
  action-routed (`ensure` / `complete`), mirroring
  `ops_wiki_generation_v1`'s claim/complete shape. Authorization is
  **`turn_private.text_owner()` / `turn_private.lock_turn()`** -- the same
  chain `read_grounded_ai_assist_context_v1` already uses -- deliberately
  not `knowledge_review_private.current_actor()` (Ops-only, raises
  `OPS_FORBIDDEN` for anyone not staff). The caller here is the traveler
  who owns the turn, not an operator.
- `lib/server/knowledge/wiki/grounded-ai-assist-job.ts`,
  `runGroundedAiAssistJob`: calls `ensure`, and if it claimed the job,
  runs `runGroundedAiAssist` (slice 7) and calls `complete` with the real
  outcome (or a `failed` outcome if the search loop itself throws) --
  never losing a claim on an unexpected error.
- `app/api/chat/grounded/ai-assist/route.ts`: cookie-identity Web route,
  mirroring `app/api/chat/grounded/route.ts`'s auth exactly. The client
  (`SavedAnswers.tsx`) calls this repeatedly until it sees a terminal
  status.
- `SavedAnswers.tsx`: a button appears only under a `blocked`-family
  notice (the reviewed answer itself found nothing). Its result is always
  labeled "AI-generated, not reviewed" -- visually and textually distinct
  from the reviewed answer above it, never presented as an equally
  authoritative result.

Verified against a **real database** (native PostgreSQL 16, all 59
migrations replayed, a full real `submit_grounded_turn` →
`claim_grounded_work` → `authorize_grounded_dispatch` →
`complete_grounded_work` round trip building a genuinely blocked turn): 10
real scenarios -- first claim, concurrent pending, non-owner denial
(no jobId/claimToken leaked), wrong-claimToken rejection, correct
completion, post-completion replay without re-running the search, a
forced-stale reclaim minting a fresh token, the reclaimed-away token's
late completion rejected, a real non-blocked (`clarification`) turn never
creating a job row, and Ops membership granting no special access to
another traveler's turn. Full detail:
`artifacts/VPJ-76/wiki-grounded-ai-assist-web-20260915/verification.md`.

Not built: iOS UI wiring (a deliberate next step, not this slice),
persistence of the AI-assisted result (unchanged from slice 7's decision).

## Slice 9 (2026-09-15): the real iOS trigger

Slice 8 deliberately stopped at Web; JT asked to finish iOS next. No new
product decision was needed here -- slice 8 already settled execution
model (queued/pull-driven) and disclosure (always labeled AI-generated,
not reviewed); this slice is the same job reached over the app's separate
Bearer/native-session identity instead of the Web cookie session.

What got built: `lib/server/turn/native-ai-assist-http.ts`
(`nativeGroundedAiAssist`), a thin wrapper around the same
`runGroundedAiAssistJob` slice 8 built, authenticated by copying
`nativeGroundedEvents`'s exact pattern; a matching route
(`app/api/chat/native/v4/turns/[turnId]/ai-assist/route.ts`); Swift models
(`NativeAiAssistStatus`/`Outcome`/`Reply`); `NativeAskStore.runAiAssist`,
polling outside the store's single `busy` operation slot (the same design
`receiveEvents` already uses, so a multi-second AI search never freezes
send/cancel/reload); and a SwiftUI panel in `NativeAskView` appearing only
when `result.originalOutcome == "blocked"`, always disclosed as
AI-generated and unreviewed.

Verified by a real, run-to-completion XCTest pass in this session's own
sandbox: JT ran `sudo xcode-select -s /Applications/Xcode.app` and
accepted the Xcode license on request. The first `xcodebuild build`/
`build-for-testing` reported success, but that was misleading -- the new
`NativeAiAssistStateTests.swift` had never actually been added to
`project.pbxproj`'s `VisePandaTests` target (dropping a file on disk does
not register it with this project's explicit, non-synchronized target
membership), so the compiler never saw it. Caught by running the tests
once this sandbox's initially-hung CoreSimulator self-recovered:
`-only-testing:...NativeAiAssistStateTests` reported "Executed 0 tests" --
the tell. Fixed by adding the missing `PBXFileReference`/`PBXBuildFile`/
group/Sources-phase entries, which then surfaced a second real bug (the
five test methods lacked `@MainActor`, required to read the store's
main-actor-isolated state inside an `XCTAssert`). After both fixes: 5/5
new tests and 51/51 (6 skipped) of the full existing `VisePandaTests`
target passed on a real booted simulator, no regressions. Full detail,
including why the record keeps the initial false-positive rather than
quietly erasing it:
`artifacts/VPJ-76/wiki-grounded-ai-assist-ios-20260915/verification.md`.

Not built: persistence of the AI-assisted result (unchanged from slices
7-8); a real native integration test mirroring
`tests/integration/turn/native-grounded-http.test.mjs` (judged lower
value than the coverage this route's dependencies already have).

## Slice 10 (2026-09-15): EvidencePack v2

VPJ-76's own acceptance criteria requires the search loop's answer carry
"required/background/missing/conflicts 及 statement/publication/source/span
和检索/ontology版本" and that "关键遗漏、错误引用和证据充足时全拒答均判失败，
不由相关度决定完整性" -- completeness decided structurally, not by the
model's own self-report. Slices 1-9 shipped a much simpler
`summary`/`citations`/`gaps` shape that satisfied none of this.

`knowledge_read_v1` has always returned `assertionId`,
`assertion.{predicate,objectId}` and `sources[].sourceRevisionId` per
statement -- `published-corpus.ts` previously discarded all three,
keeping only `factId`/`text` for the lexical search primitive. It now
also returns a `provenance` map alongside the search entries, read from
the same already-authorized response. `lib/server/knowledge/wiki/evidence-pack.ts`
(new) uses that provenance to decide, in code, whether a citation's real
underlying `{predicate,objectId}` actually matches a required claim's own
triple -- the exact check `grounded-turn/1`'s resolver already uses --
rather than trusting the model's claim that it answered fully. The
model's judgement is kept only where code genuinely cannot substitute for
it: whether two cited passages disagree, now a first-class `conflicts`
field split out of `gaps` in the model's own answer schema
(`wiki-search.ts`).

Additive: `summary`/`citations`/`gaps` (what Web/iOS already render)
stay unchanged from slices 7-9; `evidence: EvidencePack` and a flat
`conflicts` field are new on `GroundedSearchOutcome`'s "answered"
variant. Place questions get `evidence.required: []` (unchanged from
slice 6's decision that this module never resolves a placeSubjectId) --
their citations land in `background` instead of fabricated coverage.

Verified: 6 new `wiki-evidence-pack.test.mjs` cases for `buildEvidencePack`
itself, plus new/extended assertions in `wiki-grounded-search.test.mjs`
(a real end-to-end "covered" required claim with real provenance; a
place-question answer's `required` staying empty) and
`wiki-published-corpus.test.mjs` (the real provenance map's exact
contents; four new malformed-provenance rejection cases). 453/453 full
contract suite, no regressions. iOS: `scripts/ios/ci.py` run locally end
to end (real build, real signature, a real owned simulator,
`test-without-building` against the entire shared scheme) -- every step
exited 0, `VisePandaTests` 51/51 (6 skipped), `VisePandaUITests` 25/25
(17 skipped), confirming the additive `conflicts` rendering in
`NativeAskView.swift` introduced no regression. Full detail:
`artifacts/VPJ-76/wiki-evidence-pack-v2-20260915/verification.md`.

Not built: a real model call exercising the new `conflicts` field (no
live provider credential configured in any environment, consistent with
every other slice).

## Slice 11 (2026-09-15): the frozen zh/en evaluation set

VPJ-76's own acceptance criteria's last unbuilt items: "冻结复用加新增的
中英问题族与qrels/必要claim真值...跑实际查询...并报告覆盖/过拒答、
p50/p95与成本分母。记录同批结构化/直接读取baseline和本路径实测差异。"
JT chose fixture-first (a real-model pass over this set stays a
deliberate, separate, explicitly-authorized follow-up rather than
automatically spending the configured API key budget), and "every
`QuestionDefinition` gets tested" for scale.

New directory `evals/wiki-agentic-search/` (34 scenarios: one zh + one en
per real question definition, plus 6 diversity cases covering every
non-gate terminal). It does not claim to establish `AI-42`'s general
qrels infrastructure (`evals/qrels/README.md`, `evals/runners/README.md`
both say that's out of scope for those directories today) — ground truth
is imported directly from `questions.ts`, never re-typed. The runner
calls the real `runGroundedWikiSearch` against a fixture RPC/model
transport (this thread's established "real query, fixture transport"
convention) and writes a report every run.

The structured/direct-lookup baseline comparison: `knowledge_read_v1`
already scopes its response before this module runs, so a direct lookup
trivially "finds" anything in that corpus — the real, reported comparison
is whether the *agentic search loop* actually reached that same content.
`retrieval_miss` and `budget_exhausted` are exactly the two terminals
where that divergence happens; the report lists them explicitly.

Real fixture-mode run this session: 34/34 scenarios matched ground truth
(verdict PASS), 90.9% coverage, 9.1% over-refusal (3 deliberately
constructed divergence cases), p50/p95 0.16ms/2.49ms (fixture-mechanism
overhead, explicitly labeled as not real latency). Full detail, including
every deliberate limitation of a fixture-only, self-authored eval:
`artifacts/VPJ-76/wiki-frozen-eval-20260915/verification.md`.

With this slice, every item VPJ-76's acceptance criteria lists is now
built and evidenced (`artifacts/VPJ-76/unrun.md`). Two deliberate scope
cuts remain open, carried forward from earlier slices, not oversights: a
real-model pass over this frozen set, and persistence of the AI-assisted
result.

### Real-model follow-up (2026-09-16)

JT authorized the deferred real-model pass ("授权跑评测集"). Run against
real GLM (`glm-5.3-flash`) via the new manual/on-demand
`scripts/eval/run-wiki-agentic-real-model.mjs` (never wired into
`pnpm evals`/CI -- it makes real, billed calls): **65.6% accuracy**
(21/32; `provider_failure`/`budget_exhausted` scenarios are
mechanism-only and were skipped, a real model cannot be scripted into
them). Two real bugs were caught and fixed *before* the batch ran (a
missing `rpc` in the script's own `deps`, and a citation-quote
`.trim()` gap the longer real corpus text exposed) -- both by running the
code for real before spending budget on 32 calls that would otherwise
have failed for reasons unrelated to the pipeline.

Of the 11 mismatches: one is a genuine bug in this eval's own scenario
design (`diversity-retrieval-miss-en` accidentally reused *matching*
content, not irrelevant content -- fixed in the same follow-up, not
re-run against the real API to avoid a second unvalidated spend); two are
the pipeline correctly degrading to `provider_failure` on a real
non-conformant model response (the exact safety property the closed
schema exists to guarantee, not a defect); three are multi-claim
questions not covering every claim within `maxRounds: 2` (real, honest
partial answers under real budget pressure -- actionable tuning signal,
not a defect); four are place-question `retrieval_miss` results this run
could not fully explain (by this repo's own deliberate design,
`retrieval_miss` strips the rounds/queries that would show why -- flagged
as genuinely unresolved, not explained away). Not once did real model
imperfection cause a fabricated answer, a crash, or a bypass of the
six-way reason taxonomy across all 32 real calls. Full root-cause
breakdown: `artifacts/VPJ-76/wiki-frozen-eval-real-model-20260916/verification.md`.

## Verification

Per-slice evidence: `artifacts/VPJ-76/wiki-agentic-search-20260915/` (slice 1),
`wiki-published-corpus-20260915/` (slice 2), `wiki-grounded-search-20260915/`
(slice 3), `wiki-reason-codes-20260915/` (slice 4), `wiki-research-corpus-20260915/`
(slice 5), `wiki-real-model-probe-20260915/` (real model probe),
`wiki-search-convergence-20260915/` (convergence + CJK fix),
`wiki-place-questions-20260915/` (slice 6),
`wiki-grounded-turn-integration-20260915/` (slice 7),
`wiki-grounded-ai-assist-web-20260915/` (slice 8),
`wiki-grounded-ai-assist-ios-20260915/` (slice 9),
`wiki-evidence-pack-v2-20260915/` (slice 10),
`wiki-frozen-eval-20260915/` (slice 11, above). As of slice 11: 453/453
full TS contract suite + 27/27 evals suite, no regressions; `pnpm
lint`/`typecheck`/`docs:check` clean; iOS app + test targets build with
zero errors and a real, run-to-completion XCTest pass (51/51 + 25/25,
both with their existing skip counts, as of slice 10 -- slice 11 touches
no iOS code).
Slices 7, 8 and 10 add a migration or schema change of note — slice 7 one
new read-only RPC, slice 8 one new table plus dispatcher RPC (both
verified against a real Postgres instance), slice 10 a new corpus field
(no migration, `knowledge_read_v1` already returned this data). Slice 9
adds no migration, only a client for slice 8's job. Slice 11 adds no
production code, only a new eval directory. Every other slice remained
migration-free.
