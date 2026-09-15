# VPJ-76 (#360) — explicitly UNRUN

First slice (agentic search loop mechanism) — see
`wiki-agentic-search-20260915/verification.md` and
`docs/contracts/wiki-agentic-search.md`.

- ~~Round-based agentic search loop mechanism~~ **DONE, fixture-verified
  only.** `runWikiSearchJob` correctly bounds rounds via `CostGuard`,
  detects and reports duplicate queries without re-searching, accumulates
  usage, and returns a closed-schema outcome. Not verified against a real
  model.
- **Real model call.** No real Qwen/GLM/DeepSeek call has been made
  against `wiki_search_v1` yet — semantic quality (does the model search
  sensibly, cite correctly, know when to stop) is entirely unverified.
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
- ~~Ask-path integration~~ **PARTIALLY DONE.** `runGroundedWikiSearch`
  (`lib/server/knowledge/wiki/grounded-search.ts`) takes an already-
  recognized `KnowledgeIntent` (from the existing `knowledge_intent_v1`
  path) plus a `city` (from existing Trip context) and drives the whole
  chain: intent → scene → published corpus → search loop. Still not
  actually called from `grounded-turn/1`, the durable text worker, iOS, or
  the Web reader -- this is the glue function, not the wiring into any of
  those. Place questions (`place_address`/`place_opening_hours`/
  `place_address_and_hours`) are `capability_unsupported` here: they need a
  resolved `placeSubjectId` from place disambiguation (VPJ-19), which this
  module does not perform.
- ~~Full reason-code taxonomy~~ **DONE.** `GroundedSearchOutcome`'s
  `unavailable` kind carries exactly one of VPJ-76's required
  `missing_content`/`retrieval_miss`/`user_input_missing`/
  `capability_unsupported`/`policy_denied`/`provider_failure`. Notably:
  `clarification` → `user_input_missing` (the traveler's own input was
  insufficient) is distinguished from `unsupported`/place questions →
  `capability_unsupported` (this capability doesn't cover that question
  kind yet); "no published content exists" (`missing_content`) is
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
- **Real iOS/Web readback** of any answer this loop produces.

#360 remains OPEN. The retrieval/loop mechanism, real product-knowledge
connection, intent→search glue, the required six-way reason taxonomy, and
a real research-knowledge connection all exist and are tested; none of it
is actually invoked by any real product or Ops surface yet, and evaluation
work that VPJ-76 requires for closure has not started.
