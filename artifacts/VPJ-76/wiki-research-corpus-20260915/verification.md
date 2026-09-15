# #360 (VPJ-76) verification — research-index corpus adapter

## Environment

Same as the earlier VPJ-76 slices: pure TS logic against an injected RPC
function, no database, no real model call, no migration.

## What was verified

`tests/contract/knowledge/wiki-research-corpus.test.mjs` — 9/9 pass:

| Test | Result |
| --- | --- |
| Lists pages via `ops_wiki_read_v1({})`, then fetches each page's detail and extracts the latest revision's summary | PASS |
| A structured `wiki-draft/2` revision's summary is extracted the same way as a plain `{summary, gaps}` draft | PASS |
| An empty page list → empty corpus, not an error | PASS |
| A page with zero revisions, or a `null` `draftContent` (the legacy-row case VPJ-75 slice 2 found) → skipped, not an error | PASS |
| A list-call RPC error → `unavailable`/`OPS_UNAVAILABLE` | PASS |
| A detail-call RPC error → `unavailable` with the RPC's exact code preserved | PASS |
| A thrown/rejected RPC call → caught as `OPS_UNAVAILABLE`, not propagated | PASS |
| A `draftContent` matching neither known shape → treated as a real malformed-response error, not silently skipped (distinct from the legitimate "no draft yet" case above) | PASS |
| `maxPages` actually caps how many detail calls are made; an out-of-bounds `maxPages` is rejected before any call | PASS |

Also re-ran for regressions:
- `node scripts/run-ci-suite.mjs contract` — 423/423 pass, 0 skipped, 96 test files, no regressions
- `pnpm lint` / `pnpm typecheck` / `pnpm docs:check` — all clean

## What was NOT verified

- **No real database call.** Every test supplies its own fake RPC
  function; the real `ops_wiki_read_v1` SQL function (its actual
  `current_actor()` Ops-membership gating, its list/detail response
  shapes) was not exercised — only this adapter's handling of that
  function's documented response shape.
- **No real caller.** Nothing wires `buildResearchWikiCorpus` into
  `runWikiSearchJob` the way `runGroundedWikiSearch` does for the product
  corpus, and nothing in `/ops/wiki` or any other Ops surface exposes a
  research-search trigger.
- **The N+1 list-then-detail call pattern is not load-tested.** Acceptable
  at the current small page count; not validated against a larger corpus.
