# #360 (VPJ-76) verification — required six-way reason taxonomy

## Environment

Same as the earlier VPJ-76 slices: pure TS logic against injected `rpc`
and `fetch` functions, no database, no real model call, no migration.
This slice is a pure refactor of `grounded-search.ts`'s output shape --
no new files besides this one and the updated test file.

## What was verified

`tests/contract/knowledge/wiki-grounded-search.test.mjs` — 12/12 pass
(5 new since slice 3, 7 updated for the new outcome shape):

| Test | Result |
| --- | --- |
| `clarification` intent → `user_input_missing` (never calls the RPC) | PASS |
| `unsupported` intent → `capability_unsupported` | PASS |
| A place-question intent → `capability_unsupported` | PASS |
| Real scene mapping still reaches `knowledge_read_v1` correctly (asserted on the literal call arguments) | PASS |
| Empty corpus → `missing_content`, no model call | PASS |
| `KNOWLEDGE_DISABLED` RPC error → `policy_denied` specifically, not the generic bucket | PASS |
| Any other RPC error → `provider_failure`, code preserved | PASS |
| **Content exists, loop finds nothing relevant → `retrieval_miss`, distinct from `missing_content`** (the key new distinction this slice makes) | PASS |
| A loop-level `failed` (HTTP 500) → `provider_failure` with `providerCode: "PROVIDER_UNAVAILABLE"` | PASS |
| A real published statement still flows through to a real `answered` result unchanged | PASS |
| `budget_exhausted` and `cancelled` remain their own kinds, not folded into the six reason codes | PASS |
| Invalid city → `provider_failure`/`INVALID_INPUT` (via the corpus adapter, not re-validated here) | PASS |

Also re-ran for regressions:
- `node scripts/run-ci-suite.mjs contract` — 414/414 pass, 0 skipped, 95 test files, no regressions
- `pnpm lint` / `pnpm typecheck` / `pnpm docs:check` — all clean

## What was NOT verified

- Same caveats as every earlier VPJ-76 slice: no real model call, no real
  database, no real Trip context, no actual product caller.
- **The reason-code mapping choices themselves are a judgment call, not
  externally validated.** In particular, treating `budget_exhausted` and
  `cancelled` as outside the six-way taxonomy (rather than, say, folding
  `budget_exhausted` into `retrieval_miss`) is this session's own reading
  of VPJ-76's acceptance text ("missing_content、retrieval_miss、
  user_input_missing、capability_unsupported、policy_denied、
  provider_failure 分开") -- a real product/UX review of how these should
  surface to a traveler has not happened.
