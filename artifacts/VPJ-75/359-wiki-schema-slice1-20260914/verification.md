# #359 slice 1 verification — wiki page/revision/job schema

## Environment

Real local Supabase, project_id `vp-v4-ai-08`, own containers (no collision
with other concurrent sessions' `vp-native-session-replay-20260910` /
`vp-local-upgrade-4g1ozubo`).

## Migration application

- `supabase db push --local` (incremental, on top of the existing history
  including this session's earlier #363 slice) — clean.
- `supabase db reset --local` (full cold replay of the entire migration
  history, ~50+ migrations, into a fresh local database) — also clean, no
  self-check failure this time (unlike the disposable-project restore
  rehearsal earlier this session, which hit a genuine incompatibility on a
  from-cold full replay against a *brand new Supabase project*; a local
  reset is a different code path and did not reproduce that issue here).

## Real inserts

Happy path (one row per table, linked): `wiki_pages` (source_summary,
page_key `source:vpj75-test-source-1`) → `wiki_generation_jobs` (succeeded,
cost_unknown=false, cost_tokens=1200) → `wiki_page_revisions` (version 1,
one source_revision_id, prompt_version `wiki-v1`) — all inserted
successfully, verified by selecting each row back.

## Counterexamples (7)

| # | Case | Expected | Result |
| --- | --- | --- | --- |
| 1 | `status='queued'` with `started_at` set | rejected | PASS |
| 2 | `status='failed'` without `error_code` | rejected | PASS |
| 3 | `status='succeeded', cost_unknown=false` without `cost_tokens` | rejected | PASS |
| 4 | Duplicate `(page_key, input_digest)` | rejected | PASS |
| 5 | Empty `source_revision_ids` array | **initially admitted — real bug** | fixed, then PASS |
| 6 | Duplicate `(page_id, version)` | rejected | PASS |
| 7 | Malformed `input_digest` (not 64-hex) | rejected | PASS |

### The one real finding (case 5)

First cut used `array_length(source_revision_ids, 1) >= 1` in the CHECK
constraint. Verified directly against Postgres:

```
select array_length(array[]::uuid[],1), cardinality(array[]::uuid[]);
 array_length | cardinality
--------------+-------------
              |           0
```

`array_length()` returns `NULL` for an empty array; `NULL >= 1` is `NULL`,
and Postgres treats a `NULL` CHECK result as satisfied — the empty-array
counterexample actually inserted successfully on the first attempt. Fixed
by switching to `cardinality(source_revision_ids) >= 1` (returns `0` for
empty, so the check correctly evaluates to `false`). Re-ran the full
migration via `supabase db reset --local` and re-verified: same
counterexample now correctly rejected, and all other 6 counterexamples plus
the happy path still behave as expected.

## Tests and checks

- `tests/contract/knowledge/wiki-schema.test.mjs` — 8/8 pass.
- `node scripts/run-ci-suite.mjs contract` — 351/351 pass (8 new; 343
  before this slice, no regressions).
- `npm run typecheck` — clean.
- `npm run lint` — 275 files, clean (2 new files this slice).
- `npm run docs:check` — VPJ plan + AI Core baseline pass.

## Explicitly out of scope this slice

See `docs/contracts/wiki-generation-schema.md`'s "Non-goals" and
`artifacts/VPJ-75/unrun.md` — no dispatcher RPC, no LLM worker call, no Ops
UI, no Docling integration, no contradiction handling, no expectedVersion
conflict RPC, no prompt-injection fixtures.
