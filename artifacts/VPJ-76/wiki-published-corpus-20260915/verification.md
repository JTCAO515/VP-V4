# #360 (VPJ-76) verification — real published-knowledge corpus adapter

## Environment

Same as the first VPJ-76 slice: no Docker, no real Postgres in this
verification (pure TS logic against an injected RPC function, no
database). No migration in this slice.

## What was verified

`tests/contract/knowledge/wiki-published-corpus.test.mjs` — 7/7 pass:

| Test | Result |
| --- | --- |
| A real-shaped `knowledge_read_v1` response converts to a search corpus, folding `conditions`/`exclusions` into the searchable text | PASS |
| `status: "no_eligible_content"` → empty corpus, not an error | PASS |
| `status: "available"` with zero statements → empty corpus | PASS |
| An RPC-level `error` (e.g. `KNOWLEDGE_DISABLED`) surfaces its code without throwing | PASS |
| A thrown/rejected RPC call is caught as `KNOWLEDGE_UNAVAILABLE`, not propagated | PASS |
| An invalid `{city, scene, locale}` is rejected before any RPC call is made | PASS |
| A malformed response — wrong `schemaVersion`, missing `statements`, an empty `text`/`factId`, a non-array `conditions`, or a duplicate `factId` across two statements — is rejected as `KNOWLEDGE_UNAVAILABLE`, never silently reshaped or half-accepted | PASS |

Also re-ran for regressions:
- `node scripts/run-ci-suite.mjs contract` — 402/402 pass, 0 skipped, 94 test files, no regressions
- `pnpm lint` / `pnpm typecheck` / `pnpm docs:check` — all clean

## What was NOT verified

- **No real database call.** Every test supplies its own fake RPC
  function returning a hand-written response shape; the real
  `knowledge_read_v1` SQL function (its actual eligibility filtering,
  authentication requirements, and 50-row limit) was not exercised here —
  only this adapter's handling of that function's documented response
  shape.
- **No real caller.** Nothing in the product yet calls
  `buildPublishedWikiCorpus` and feeds its result into
  `runWikiSearchJob` — that wiring, and deciding where the
  `{city, scene, locale}` scope comes from in a real request, is separate,
  not-yet-done work.
- **No real published content.** No statement has actually been reviewed
  and published through this path as part of this verification.
