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
- ~~Connection to real published Wiki content~~ **PARTIALLY DONE.**
  `buildPublishedWikiCorpus` (`lib/server/knowledge/wiki/published-corpus.ts`)
  turns a real `knowledge_read_v1` response into a search corpus, reusing
  that RPC's existing eligibility filtering (published/not-expired/
  reviewed) rather than adding a second read path. Still missing: the
  caller must already know which `{city, scene, locale}` to ask for --
  there is no free-text "identify the object/city/scene" step yet (that
  is intent recognition, out of scope here), and there is still no
  research-index-vs-product-index separation (this only ever reads the
  product-eligible path).
- **Ask-path integration.** Not wired into `grounded-turn/1`,
  `knowledge_intent_v1`, iOS, or the lightweight Web reader.
- **Full reason-code taxonomy** (missing_content/retrieval_miss/
  user_input_missing/capability_unsupported/policy_denied/
  provider_failure) — the current outcome shape is a smaller first cut.
- **EvidencePack v2 schema** (required/background/missing/conflicts,
  statement/publication/source/span, retrieval/ontology version, reason
  code, safe trace ID) — not built; current `citations`/`gaps`/`coverage`
  is intentionally smaller.
- **Frozen zh/en question-family/qrels evaluation set** — VPJ-76's own
  required acceptance step, not started.
- **Real iOS/Web readback** of any answer this loop produces.

#360 remains OPEN. The retrieval/loop mechanism exists and is tested and
now has a real (though scope-requires-a-known-city/scene) connection to
published knowledge; product integration and evaluation work that VPJ-76
actually requires for closure have not started.
