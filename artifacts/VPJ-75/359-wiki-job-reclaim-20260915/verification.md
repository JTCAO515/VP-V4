# #359 job-reclaim verification — stale `running` job recovery

## Environment

Real native PostgreSQL 16 (Homebrew, no Docker in this sandbox), driven
through this repo's own `tests/integration/knowledge/wiki-draft.test.mjs`
harness (`VP_WIKI_PG_BIN`/`VP_WIKI_PG_MODULE`, the same native-PostgreSQL
fixture #397/#399/#400 used) — real `initdb`/`pg_ctl`, the full real
migration history replayed in order through this change's own migration,
real `auth.uid()`/`auth.jwt()` reading `request.jwt.claim(s)` GUCs (SQL
fixture, not real GoTrue — same caveat every prior slice in this file
records). `pg` npm client installed to a scratch directory, not added to
this repo's `package.json`/lockfile.

## The gap this closes, and the bug a naive fix would have

`docs/contracts/wiki-generation-dispatch.md`'s slice-2 "Non-goals" flagged
that a job stuck `running` after a worker crash between `claim` and
`complete` had no recovery path. The obvious fix — let `claim` proceed if
`started_at` is old enough — has a real race: the "crashed" worker might
not actually be dead. It could `complete()` late, after a second worker has
already reclaimed the job and is running its own attempt. Without
something to distinguish "this completion belongs to the current attempt"
from "this completion belongs to an attempt that's been superseded," the
late completion would either race the new attempt or silently overwrite
it.

Fixed with a fencing token: `wiki_generation_jobs.claim_token` is a fresh
UUID on every `claim` (including a reclaim), and `complete` must present
the exact token its own `claim` returned — a stale token is rejected
`OPS_CONFLICT`, not applied.

## What was verified (real Postgres, not fixture)

All 20 tests in `tests/integration/knowledge/wiki-draft.test.mjs` pass,
including two new ones added for this change:

| Test | Result |
| --- | --- |
| Migration (`20260915180000_vpj_75_wiki_job_reclaim.sql`) is transactionally reversible (begin/rollback leaves `claim_token` absent; begin/commit adds it) | PASS |
| A completion recorded **before** this migration existed (no `claimToken` in its stored input) still replays its exact receipt after the migration — the new fencing check does not retroactively invalidate old completions | PASS |
| A fresh `running` job (just claimed) cannot be reclaimed by an immediate re-`claim` of the same `(pageKey, inputDigest)` — still `OPS_CONFLICT` | PASS |
| Back-dating `started_at` to 6 minutes ago (simulating an abandoned worker) lets a re-`claim` succeed, reopening the **same job row** (`jobId` unchanged) with a **fresh, different `claimToken`** | PASS |
| The real race this exists to prevent: the original claim holder's completion, carrying its now-superseded `claimToken`, is rejected `OPS_CONFLICT` and writes no revision (`ops_wiki_read_v1` version stays 0 for that page) | PASS |
| A completion missing `claimToken` entirely (while the job is still `running`, so the status check doesn't mask this) is rejected `INVALID_INPUT` | PASS |
| The actual new claim holder's completion, with the correct fresh `claimToken`, succeeds and the page version advances to 1 | PASS |

Also re-ran for regressions with this change in place:
- `node scripts/run-ci-suite.mjs contract` — 378/378 pass, 0 skipped, 91 test files, no regressions
- `pnpm lint` / `pnpm typecheck` / `pnpm docs:check` — all clean
- `tests/contract/knowledge/wiki-complete.test.mjs` — 3/3 pass (existing fixture updated to carry `claimToken`; assertion on the failed/cancelled outcome shape updated to expect the fencing token now included)

## What was NOT verified

- **No actual killed OS process.** The crash this feature recovers from is
  simulated by directly back-dating `started_at` in the database, not by
  starting a real worker process and sending it `SIGKILL` mid-`claim`.
  The state machine and fencing logic are proven; an actual process-level
  crash was not reproduced.
- **No real GoTrue/PostgREST**, same as every other native-PostgreSQL slice
  in this file — the signed-in session is a SQL-level fixture.
- **The 5-minute threshold is not tuned against any real observed timeout
  distribution** — it is chosen to be comfortably larger than
  `wiki-generation-job.ts`'s maximum allowed `timeoutMs` (60000ms / 60s),
  not derived from production data (none exists yet for this path).
- **No caller-side reclaim/retry policy.** This change makes reclaiming
  possible at the database/RPC level; nothing automatically retries a
  stale job or surfaces it to an operator. That remains a separate,
  unbuilt piece (an Ops-visible "stuck jobs" view, or an automated sweep
  that calls `claim` again for known-stale rows) if the product actually
  needs one.
- **Branch not yet merged.** See PR for current CI status.
