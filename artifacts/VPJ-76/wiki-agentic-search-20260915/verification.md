# #360 (VPJ-76) verification — agentic search loop, first slice

## Environment

Same sandbox as the VPJ-75 slices this session (`docs/contracts/wiki-job-reclaim.md`
etc.): `node`/`pnpm` installed via Homebrew, no Docker, no real provider
credentials. This slice needed neither a database nor a real model call —
it is pure application logic (protocol contract + retrieval primitive +
loop) — so those constraints matter less here than for the DB-touching
VPJ-75 slices.

## What was verified (real code, injected fixture transport — not a real model)

`tests/contract/knowledge/wiki-search-index.test.mjs` — 7/7 pass:

| Test | Result |
| --- | --- |
| Entry containing every query term ranks above a partial match | PASS |
| Exact-phrase match outranks a same-word-count bag-of-words match | PASS |
| No matching terms returns `[]`, does not throw | PASS |
| `limit` respected; identical calls return identical results (determinism) | PASS |
| Malformed corpus (empty text, extra key, duplicate pageKey) rejected | PASS |
| Empty/overlong query rejected | PASS |
| Empty corpus returns `[]` without throwing | PASS |

`tests/contract/knowledge/wiki-search-job.test.mjs` — 10/10 pass:

| Test | Result |
| --- | --- |
| Model answers in round 1 without searching | PASS |
| Search then answer: round 2's prompt actually contains round 1's real results (asserted on the literal request body sent to `fetch`, not just the final outcome) | PASS |
| A repeated query runs no new search, still consumes a round, and the next prompt says so | PASS |
| `maxRounds` reached without an answer → `budget_exhausted`, with the attempted queries returned | PASS |
| Model output outside the closed `{action:...}` schema → `failed`/`MODEL_OUTPUT_INVALID` | PASS |
| `no_content` with citations, or `answered`/`partial` with zero citations → rejected | PASS |
| Provider HTTP failure → `failed`, not a thrown exception | PASS |
| Already-aborted signal → `cancelled` before any network call | PASS |
| Invalid input (bad locale) → `failed`/`INVALID_INPUT` before any network call | PASS |
| Token usage accumulates correctly across multiple real rounds | PASS |

Also re-ran for regressions with this change in place:
- `node scripts/run-ci-suite.mjs contract` — 395/395 pass, 0 skipped, 93 test files, no regressions
- `pnpm lint` / `pnpm typecheck` / `pnpm docs:check` — all clean

## What was NOT verified

- **No real model call.** Every test above uses an injected `fetch`
  returning a scripted response. Whether a real Qwen/GLM/DeepSeek model
  actually produces useful search queries, cites correctly, or knows when
  to stop searching is entirely untested here.
- **No real published-Wiki corpus.** The `corpus` in every test is a
  hand-written fixture; nothing here reads from
  `knowledge_review_private` or any publication table.
- **No eligibility/expiry/withdrawal gating**, no research-vs-product
  index separation — both required by VPJ-76's acceptance criteria, both
  out of scope for this slice.
- **No Ask-path integration** (`grounded-turn/1`, iOS, Web) — this module
  is not called from anywhere in the product yet.
- **No real-provider cost/latency data** — `maxRounds`, `maxOutputTokens`,
  and the transcript truncation constants (`MAX_ROUNDS_IN_TRANSCRIPT`,
  `EVIDENCE_TEXT_EXCERPT`, `MAX_PROMPT_LENGTH`) in
  `wiki-search-job.ts` are conservative defaults, not tuned against
  observed real-world token/latency behavior (none exists yet for this
  path).
