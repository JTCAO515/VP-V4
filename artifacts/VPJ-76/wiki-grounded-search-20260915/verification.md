# #360 (VPJ-76) verification — intent → scene → corpus → search glue

## Environment

Same as the earlier VPJ-76 slices: pure TS logic against injected `rpc`
and `fetch` functions, no database, no real model call, no migration.

## What was verified

`tests/contract/knowledge/wiki-grounded-search.test.mjs` — 7/7 pass:

| Test | Result |
| --- | --- |
| `clarification`/`unsupported` intent never calls the RPC (`unsupported_intent`) | PASS |
| A place-question intent (`place_opening_hours`) is `unsupported_intent` here -- no place disambiguation is performed by this module | PASS |
| The intent's real `questionDefinition` scene is what actually gets sent to `knowledge_read_v1` (asserted on the literal RPC call arguments, not just the final outcome) | PASS |
| No published content short-circuits to `no_content` without any model call (asserted by making `fetch` throw if called) | PASS |
| An RPC-level error propagates as `corpus_unavailable` with its exact code | PASS |
| A real published statement flows end to end: intent → scene → corpus → search loop → `answered`, with the loop's actual summary/citations coming through unchanged | PASS |
| An invalid city is rejected by the corpus adapter (not this module re-validating), surfaced as `corpus_unavailable`/`INVALID_INPUT` | PASS |

Also re-ran for regressions:
- `node scripts/run-ci-suite.mjs contract` — 409/409 pass, 0 skipped, 95 test files, no regressions
- `pnpm lint` / `pnpm typecheck` / `pnpm docs:check` — all clean

## What was NOT verified

- **No real intent recognition.** Every test supplies an already-valid
  `KnowledgeIntent` object directly; the real `knowledge_intent_v1` model
  call that produces one is untouched by this slice and not exercised
  here.
- **No real Trip-context city.** `city` is a literal test fixture value,
  not read from any real Trip.
- **No real database, no real model, no real published content** — same
  caveats as the two slices this one builds on.
- **No actual caller.** Nothing in `grounded-turn/1`, the durable text
  worker, iOS, or the Web reader invokes `runGroundedWikiSearch` yet.
