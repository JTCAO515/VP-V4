# #360 (VPJ-76) verification — slice 11, frozen zh/en evaluation set

## What this slice implements

VPJ-76's own acceptance criteria's last two required-but-unbuilt items,
from `docs/program/2026-09-05/issue-bodies/VPJ-76.md`:

> 冻结复用加新增的中英问题族与qrels/必要claim真值，调参和保留集按来源
> 版本/问题族隔离；跑实际查询、普通账号owner隔离、撤回和故障，并报告
> 覆盖/过拒答、p50/p95与成本分母。记录同批结构化/直接读取baseline和
> 本路径实测差异。

JT chose (after being asked): a fixture-first pass now, a real-model pass
deferred as an explicit separate follow-up (avoids spending the
configured API key budget automatically); and "every `QuestionDefinition`
gets tested" for scale, over a smaller representative sample.

New directory: `evals/wiki-agentic-search/` — narrowly scoped to this one
feature. It does **not** claim to establish `AI-42`'s general
qrels/eval-runner infrastructure; `evals/qrels/README.md` and
`evals/runners/README.md` both say that remains out of scope for those
directories today. Ground truth (claims) is imported directly from
`lib/server/knowledge/claim/questions.ts`, never re-typed by hand.

## What was built

- `evals/wiki-agentic-search/cases.ts`: 34 frozen scenarios — one zh + one
  en case for every real `QUESTION_DEFINITIONS` key (11) and every
  `PLACE_QUESTION_IDS` entry (3) (28 "primary" full-coverage cases), plus
  6 "diversity" cases covering every non-gate terminal
  `runGroundedWikiSearch` can reach (`missing_content`, `retrieval_miss`,
  `partial_coverage`, `provider_failure`, `budget_exhausted`, and a
  simulated revoked/expired-statement partial coverage). Split
  `development`/`holdout` 17/17, matching this repo's own VPJ-66 harness
  vocabulary (`evals/harness/cases.ts`).
- `evals/wiki-agentic-search/wiki-agentic-search.evals.test.ts`: runs the
  real `runGroundedWikiSearch` against every scenario (real pipeline code,
  fixture `knowledge_read_v1` RPC + fixture model transport — the same
  "real query, fixture transport" convention every other
  `tests/contract/knowledge/wiki-*.test.mjs` file already uses), asserts
  each outcome against its ground truth (including, for full-coverage
  cases, that every required claim's `EvidencePack.required[].status` is
  `"covered"`), and writes `results.json`/`summary.md` to this directory
  every run.
- The structured/direct-lookup baseline comparison the acceptance
  criteria asks for: since `knowledge_read_v1` already scopes its
  response to eligible/current/published statements before this module
  ever runs, a direct lookup would trivially "find" anything in that
  corpus. The real, reported comparison is whether the *agentic search
  loop* actually reached that same content — `retrieval_miss` and
  `budget_exhausted` are exactly the two terminals where a non-empty,
  correctly-scoped corpus existed yet the agentic path did not answer
  from it; the report's `baselineDivergence` array lists these.

## What was verified

Real run, this session, fixture mode (`mode: "fixture"` recorded
explicitly in the report):

| Metric | Value |
| --- | --- |
| Total scenarios | 34 (17 development / 17 holdout) |
| Coverage rate | 90.9% (30/33 attempted, excluding the deliberate `missing_content` short-circuit) |
| Over-refusal rate vs. structured baseline | 9.1% (3 scenarios — all deliberately constructed: `retrieval_miss`, `provider_failure`, `budget_exhausted`) |
| p50 / p95 elapsed | 0.16ms / 2.49ms (fixture-mechanism overhead only — **not** real network/model latency) |
| Total (fixture) usage tokens | 960 (the fixture responses' declared usage — **not** a real bill) |
| Verdict | PASS — every scenario's real outcome matched its ground truth |

`node --experimental-strip-types --test evals/wiki-agentic-search/wiki-agentic-search.evals.test.ts`
— 2/2 pass. `pnpm evals` (the full existing evals suite, 14 files) —
27/27 pass, this eval's 2 tests included, no regressions to the other 13
files. `pnpm lint` / `pnpm typecheck` / `pnpm docs:check` — clean.
`node scripts/run-ci-suite.mjs contract` — 453/453 pass, unaffected (this
slice touches no TS production code, only the new eval directory).

## What was NOT verified (deliberately, this slice)

- **No real model call.** Every scenario ran against a fixture model
  transport. A real-model pass (spending the Qwen/DeepSeek/GLM key
  budget JT provided earlier this session) is an explicit, separate
  follow-up JT can authorize when ready — not run automatically here.
- **No real database.** Owner isolation and statement revocation/expiry
  are enforced by `knowledge_read_v1`'s own SQL and were already
  verified against a real Postgres instance in slices 7-9's own database
  tests; this eval simulates "a required claim's statement was revoked"
  as "the fixture corpus never included it," which is indistinguishable
  from this module's own point of view by design, not a re-run of a real
  revocation.
- **The `development`/`holdout` split is not blind** — this same session
  both authored the cases and (eventually) would grade a real-model pass
  against them; an accepted limitation of a narrow, self-authored eval,
  documented as such in `evals/wiki-agentic-search/README.md`.
- p50/p95/token figures measure this fixture harness's own code-path
  overhead, not production performance or real cost — labeled explicitly
  in the report's own `note` field so a future reader cannot mistake them
  for real numbers.

With this slice, VPJ-76's (#360) acceptance criteria items are all now
built and evidenced (see `artifacts/VPJ-76/unrun.md` for the item-by-item
record): the retrieval/loop mechanism, real product-knowledge connection,
intent→search glue, the six-way reason taxonomy, real Web and iOS trigger
paths, EvidencePack v2, and this frozen evaluation set. The two items
still explicitly open are a real-model pass over this frozen set and
persistence of the AI-assisted result — both deliberate scope cuts
carried forward from earlier slices, not oversights.
