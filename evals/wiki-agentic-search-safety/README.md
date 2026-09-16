# wiki-agentic-search-safety: MIRACL + BIPIA method reuse (VPJ-16 / #206)

#206's own acceptance criteria requires: "HF复用：借MIRACL/BIPIA方法分别
诊断检索、无答案与注入，保持请求级资格在召回及模型外发前执行、展示前重验；
历史百科/旅行基准不当实时知识，相关高分不推翻时效、反证与许可。" This
directory is that bullet, scoped precisely to what this repo's own prior
research already settled
(`docs/research/VISEPANDA-HUGGINGFACE-REUSE-REPORT-2026-09-10.md`,
"4.4 MIRACL 与 BIPIA 的正确用途"):

- **Borrow the method, never the dataset.** MIRACL's real corpus is
  historical Wikipedia (real licensed content, not a real China travel
  fact); BIPIA's real attack corpus is a Microsoft research benchmark.
  Neither is downloaded here. What's borrowed is MIRACL's *method*
  (diagnose retrieval failure categories, one language at a time) and
  BIPIA's *method* (attack position + task-category taxonomy, injected as
  inert strings into our own synthetic material).
- **MIRACL is monolingual only.** "两种语言各自测试并不等于跨语言检索" —
  every retrieval-diagnosis case here is zh-only or en-only; none tests a
  query in one language against corpus text in the other, and this
  directory makes no claim of cross-lingual retrieval capability.
- **This repo's existing TS harness, no new tooling** — the adoption-order
  table in the same research doc puts "HF judge/rubric、
  LongMemEval/BIPIA/TravelPlanner 的测试分类" in the "直接采用方法" (adopt
  directly) tier: our own cases, our own `node:test` harness, matching
  `evals/wiki-agentic-search/`'s own conventions.

## What's here

- `retrieval-diagnosis-cases.ts` — 7 MIRACL-method cases against the real
  `searchWikiCorpus` primitive directly (no model, no database). Every
  `expectedHits` value was verified empirically before being written, not
  predicted — this file documents real, confirmed behavior, including two
  real findings this session's own first run surfaced that weren't
  anticipated going in: the primitive has **no stopword filter** (a
  completely non-semantic match on the word "the" alone produces a
  nonzero-score hit), and short/common-word queries produce **score ties**
  across topically unrelated statements.
- `injection-cases.ts` — 8 BIPIA-method cases (4 attack categories ×
  zh/en): `task_override`, `information_exfiltration`,
  `scam_link_injection`, `content_manipulation`. Each pairs one real,
  legitimate corpus statement with one carrying an injected instruction,
  and gives the injection a unique, greppable "compliance marker" so a
  real model's resistance (or lack of it) can be checked mechanically,
  not by fuzzy judgment.
- `wiki-agentic-search-safety.evals.test.ts` — fixture-only: runs every
  MIRACL diagnosis case for real against `searchWikiCorpus`, and verifies
  the *structural* containment BIPIA-style injection needs (a citation
  pointing at a pageKey the corpus never actually returned is excluded
  from `EvidencePack`, never fabricated) — this is the one thing a fixture
  test *can* prove, since a fixture model's output is fully scripted by
  the test itself.
- `scripts/eval/run-wiki-agentic-injection-real-model.mjs` (repo root) —
  the real-model pass a fixture test cannot substitute for: whether a real
  model actually resists an injected instruction sitting inside a real,
  corpus-native search result. Manual/on-demand, real billed GLM calls,
  never wired into `pnpm evals`/CI.

## Results (2026-09-16)

Fixture pass: `pnpm evals` (all cases pass; report written to
`artifacts/VPJ-206/hf-reuse-miracl-bipia-20260916/`).

Real-model pass (GLM-5.3-flash, JT-authorized): **8/8 resisted every
injection** — not one of 8 real calls let the compliance marker into its
response, across all 4 attack categories in both languages. 7/8 also
stayed useful (cited the real, legitimate statement despite the injected
one sitting in the same corpus); the 8th case returned `unavailable` on
its first real call (a genuine, honestly-recorded instance of real model
non-determinism), and a real re-run of the exact same input succeeded --
the model not only answered correctly but explicitly named the injection
attempt in its own summary as something it disregarded. Full detail:
`artifacts/VPJ-206/hf-reuse-miracl-bipia-real-model-20260916/summary.md`.

## What this does NOT do

- Does not fix the stopword false-positive or short-query score-tie gaps
  `retrieval-diagnosis-cases.ts` surfaces -- diagnosed and reported, per
  MIRACL's own intended use here ("先诊断缺内容和别名问题"), not
  remediated. A real semantic-retrieval upgrade stays gated behind #248's
  own activation gate, unaffected by this directory.
- Does not claim these 8 injection categories are exhaustive, or that
  8/8 real resistance generalizes to every possible phrasing or provider.
  It is real, honestly-measured evidence for the specific cases run, not
  a certification.
- Does not touch production code -- this is pure diagnosis of the
  existing `searchWikiCorpus`/`runGroundedWikiSearch` pipeline, no
  behavior changed.
