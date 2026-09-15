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

## Verification

Per-slice evidence: `artifacts/VPJ-76/wiki-agentic-search-20260915/` (slice 1),
`wiki-published-corpus-20260915/` (slice 2), `wiki-grounded-search-20260915/`
(slice 3), `wiki-reason-codes-20260915/` (slice 4), `wiki-research-corpus-20260915/`
(slice 5), `wiki-real-model-probe-20260915/` (real model probe),
`wiki-search-convergence-20260915/` (convergence + CJK fix),
`wiki-place-questions-20260915/` (slice 6, above). As of slice 6: 431/431
full contract suite, no regressions; `pnpm lint`/`typecheck`/`docs:check`
clean. No database migration in any slice — nothing built so far is
persisted.
