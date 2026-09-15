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

## What this slice deliberately does not do

- **No real LLM call.** Every test uses an injected `fetch`; the loop
  mechanism (rounds, duplicate handling, budget exhaustion, usage
  accumulation, cancellation) is proven, but not "does a real Qwen/GLM/
  DeepSeek model actually search well" — that needs an operator-authorized
  real-provider run, same as VPJ-75's slices did before claiming semantic
  quality.
- **No connection to actually-published Wiki content.** `runWikiSearchJob`
  takes a `corpus` the caller supplies; nothing here queries
  `knowledge_review_private`/publication tables for real published
  revisions, applies eligibility/expiry/withdrawal gating, or separates a
  research index from a product index (both required by VPJ-76's
  acceptance criteria). That wiring is the next slice.
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
