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
here. There is also still no research-index-vs-product-index separation:
this always reads the product-eligible path, never an unpublished/research
view.

## Slice 3 (2026-09-15): intent → scene → corpus → search glue

`lib/server/knowledge/wiki/grounded-search.ts`, `runGroundedWikiSearch`:
takes an already-recognized `KnowledgeIntent` (from the existing
`knowledge_intent_v1` path -- not re-implemented here) plus a `city`
(from existing Trip context -- never free-text-recognized) and drives the
full chain: `questionDefinition(intent)` → scene → `buildPublishedWikiCorpus`
→ short-circuit if nothing is published (no wasted model call) →
`runWikiSearchJob`. (Slice 4, below, is what actually names these
outcomes with VPJ-76's required reason codes.)

Place questions (`place_address`, `place_opening_hours`,
`place_address_and_hours`) are unsupported here: `questionDefinition`
needs a resolved `placeSubjectId` from place disambiguation (VPJ-19) that
this module does not perform. Extending to place questions is a follow-up,
not attempted here.

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
- Any other unrecognized `questionDefinition` result (`unsupported`, or a
  place question pending VPJ-19) → `capability_unsupported`. This
  capability doesn't cover that kind of question yet -- a different
  reason from the traveler needing to say more.
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

## What this slice deliberately does not do

- **No real LLM call.** Every test uses an injected `fetch`; the loop
  mechanism (rounds, duplicate handling, budget exhaustion, usage
  accumulation, cancellation) is proven, but not "does a real Qwen/GLM/
  DeepSeek model actually search well" — that needs an operator-authorized
  real-provider run, same as VPJ-75's slices did before claiming semantic
  quality.
- **No place-question support.** Slice 3 (below) maps a recognized intent
  to a scene, but place questions need place disambiguation (VPJ-19) this
  module doesn't perform.
- **No research-index-vs-product-index separation** (required by VPJ-76's
  acceptance criteria) -- the corpus adapter always reads the
  product-eligible path.
- **No actual wiring into any product surface** -- `grounded-turn/1`, the
  durable text worker, iOS, and the Web reader do not call any of this
  yet.
- **No Ask-path integration.** This is not wired into `grounded-turn/1`,
  `knowledge_intent_v1`, iOS, or the lightweight Web reader. VPJ-76's
  eventual acceptance needs a real zh/en round trip through those existing
  consumers; this slice only builds the search primitive underneath.
- **No missing_content/retrieval_miss/user_input_missing/capability_unsupported/
  policy_denied/provider_failure reason-code separation** at the outcome
  level — `WikiSearchJobOutcome` currently distinguishes `answered`
  (with a `coverage` field covering the content-side cases),
  `budget_exhausted`, `failed` (with a provider `errorCode`), and
  `cancelled`. Mapping these onto VPJ-76's full six-way reason taxonomy is
  a deliberate follow-up, not done here.
- **No EvidencePack v2 schema** (required/background/missing/conflicts,
  statement/publication/source/span, retrieval/ontology version, reason
  code, safe trace ID) — `citations`/`gaps`/`coverage` here are a smaller,
  first-cut shape. Do not treat this as the final EvidencePack — see
  `docs/knowledge-upgrade/README.md`'s "产品检索与 EvidencePack v2" section
  for the full target shape.
- **No frozen zh/en question-family or qrels evaluation set** — that is
  VPJ-76's own required acceptance step once there is something real to
  evaluate.

## Verification

See `artifacts/VPJ-76/wiki-agentic-search-20260915/verification.md`. Summary:
17 new tests (`tests/contract/knowledge/wiki-search-index.test.mjs`,
`tests/contract/knowledge/wiki-search-job.test.mjs`), all passing;
395/395 full contract suite, no regressions; `pnpm lint`/`typecheck`/`docs:check`
clean. No database migration in this slice — nothing here is persisted.
