# wiki-agentic-search frozen eval (VPJ-76 / #360, slice 11)

VPJ-76's acceptance criteria requires: "冻结复用加新增的中英问题族与
qrels/必要claim真值，调参和保留集按来源版本/问题族隔离；跑实际查询、
普通账号owner隔离、撤回和故障，并报告覆盖/过拒答、p50/p95与成本分母。
记录同批结构化/直接读取baseline和本路径实测差异。"

This directory is that frozen set, scoped narrowly to this one feature
(`runGroundedWikiSearch`, `lib/server/knowledge/wiki/grounded-search.ts`).
It does **not** establish `AI-42`'s general qrels/eval-runner
infrastructure — `evals/qrels/README.md` and `evals/runners/README.md`
both say that is explicitly out of scope for what those directories cover
today. This eval imports its claim ground truth directly from
`lib/server/knowledge/claim/questions.ts` (`QUESTION_DEFINITIONS`,
`PLACE_QUESTION_IDS`) rather than re-typing it, so it cannot silently
drift from what the product actually resolves.

## What's frozen

- `cases.ts`: 34 scenarios. One zh + one en case for every real
  `QUESTION_DEFINITIONS` key (11) and every `PLACE_QUESTION_IDS` entry
  (3) — 28 "primary" full-coverage cases — plus 6 "diversity" cases
  covering every non-gate terminal `runGroundedWikiSearch` can reach
  (`missing_content`, `retrieval_miss`, `partial_coverage`,
  `provider_failure`, `budget_exhausted`, and a simulated
  revoked/expired-statement partial). Split `development`/`holdout`
  (17/17), following the naming this repo's own VPJ-66 harness already
  uses (`evals/harness/cases.ts`).
- `versions`: `{ corpus: "wiki-agentic-search-eval/1", claims: <QUESTION_ONTOLOGY_VERSION> }` — bump `corpus` whenever a case's fixture
  content changes meaning, matching the frozen-corpus discipline the
  acceptance criteria asks for.

## What the runner does

`wiki-agentic-search.evals.test.ts` calls the real
`runGroundedWikiSearch` for every scenario, with a fixture
`knowledge_read_v1` RPC (shaped exactly like the real RPC's SQL response
— `assertionId`/`assertion.{predicate,objectId}`/`sources[].sourceRevisionId`
included, the same fields `published-corpus.ts` now requires for
EvidencePack v2's provenance) and a fixture model transport. This is
**real pipeline code**, the same "real query, fixture transport"
convention every other test in `tests/contract/knowledge/wiki-*.test.mjs`
already uses — not a re-implementation or a mock of the search loop
itself.

Each scenario's real outcome is asserted against its ground-truth
`expected.kind`/`reason`, and for `full_coverage` cases, every required
claim's `evidence.required[].status` must be `"covered"`. A JSON+MD
report is written to `artifacts/VPJ-76/wiki-frozen-eval-20260915/`
every run (`results.json`, `summary.md`), reporting coverage rate,
over-refusal rate (vs. the same-batch structured/direct-lookup baseline
— see below), p50/p95 elapsed ms, and total (fixture) token usage.

### The structured/direct-lookup baseline

`knowledge_read_v1` already scopes its response to exactly the eligible,
current, published statements before this module ever sees them — a
direct/structured lookup (no search, no model) would trivially "find"
anything present in that already-scoped corpus. The real, meaningful
comparison this eval reports is: **did the agentic search loop actually
reach that same content?** `retrieval_miss` and `budget_exhausted` are
the two terminals where a non-empty, correctly-scoped corpus existed yet
the agentic path did not answer from it — `baselineDivergence` in the
report lists exactly these cases.

## Real-model pass

`scripts/eval/run-wiki-agentic-real-model.mjs` runs this same frozen set
against a real GLM (`glm-5.3-flash`) call for the model step (the
`knowledge_read_v1` side stays fixture). Manual/on-demand only — it makes
real, billed HTTP calls, so it is never wired into `pnpm evals`/CI, and
was run once, explicitly authorized by JT ("授权跑评测集"), on
2026-09-16: 65.6% accuracy against this frozen set's ground truth, with a
full root-cause breakdown of every mismatch (most attributable to this
eval's own fixture-design gaps or the pipeline correctly degrading under
real model imperfection, not pipeline defects) in
`artifacts/VPJ-76/wiki-frozen-eval-real-model-20260916/verification.md`.
Run it again with `node --experimental-strip-types scripts/eval/run-wiki-agentic-real-model.mjs`
(reads `GLM_API_KEY` from `lib/server/jobs/.local/.env`).

## What this eval deliberately does NOT do
- **No real database.** Owner isolation and revocation/expiry are
  already enforced by `knowledge_read_v1`'s own SQL (`p.expires_at>instant`,
  `c.status='reviewed'`, RLS-scoped by actor) and were verified against a
  real Postgres instance in slices 7-9's own database tests. This eval
  simulates "a required claim's statement was revoked" as "the fixture
  corpus never included it" (`diversity-getting-started-partial-en`) —
  indistinguishable from this module's own point of view, by design; it
  does not re-run a real revocation against a real database.
- **p50/p95/token numbers are fixture-mechanism measurements**, not real
  network/model latency or a real bill — labeled as such in the report's
  own `note` field. They validate the harness and pipeline code path
  itself, not production performance.
- **The `development`/`holdout` split is not blind**: this file both
  authors and (eventually, when a real-model pass runs) would grade the
  holdout cases — an accepted limitation of a narrow, self-authored eval
  built in one session, not a claim of independent held-out evaluation.

## Running it

```
pnpm evals
```

or directly:

```
node --experimental-strip-types --test evals/wiki-agentic-search/wiki-agentic-search.evals.test.ts
```
