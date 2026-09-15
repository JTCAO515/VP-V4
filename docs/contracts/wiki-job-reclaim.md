# VPJ-75 (#359) — stale `running` job reclaim

Status: implemented and verified against real native PostgreSQL 16 (no
Docker available in this sandbox; used this repo's own
`tests/integration/knowledge/wiki-draft.test.mjs` native-PostgreSQL
harness, the same one #397/#399/#400 established). See
`artifacts/VPJ-75/359-wiki-job-reclaim-20260915/verification.md`.

## The gap

Slice 2's dispatcher (`docs/contracts/wiki-generation-dispatch.md`)
deliberately left a job stuck `running` — worker crashed between `claim`
and `complete` — with no recovery: re-`claim`ing the same
`(page_key, input_digest)` always raised `OPS_CONFLICT`, forever, until
someone manually intervened in the database.

## Why not just "let claim proceed after a timeout"

That's the obvious fix, and it has a real race. The worker that appears
crashed might not actually be dead — it could still `complete()` later,
after a second worker has since reclaimed the job and started its own
attempt. Without a way to tell "this completion belongs to the current
attempt" from "this completion belongs to a superseded one," the late
completion would race the new attempt, or silently overwrite it (imagine
the old worker's stale `succeeded` outcome landing *after* the new
worker's, quietly reverting the page to old content while claiming to be
the newer revision).

## The fix: a fencing token

`wiki_generation_jobs.claim_token uuid` — a fresh UUID minted every time a
job is claimed, including a reclaim.

- `claim` returns the current `claimToken` alongside `jobId`/`expectedVersion`.
- `complete` must include `outcome.claimToken`. If it doesn't match the
  job's current `claim_token`, `complete` fails `OPS_CONFLICT` — the
  caller's claim on this job has been superseded, and its outcome (whether
  it thinks it succeeded, failed, or was cancelled) is discarded, not
  applied.
- Reclaim condition, in `claim`'s existing state check: a job is only
  reclaimable if `status = 'running'` **and** `started_at` is more than 5
  minutes old (chosen to be comfortably larger than
  `wiki-generation-job.ts`'s maximum allowed `timeoutMs` of 60 seconds — not
  tuned against production data, since none exists yet for this path).
  `queued` and fresh `running` jobs still conflict exactly as before.
- Reclaiming reopens the **same job row** (same `id`) with a **new**
  `claim_token`, `started_at` reset to now, and cost/error fields cleared —
  identical bookkeeping to the existing failed-job retry path, just with a
  different trigger condition.

This makes reclaim safe without needing to actually know whether the old
worker is dead: whichever one completes with the *current* token wins;
whichever one shows up with a stale token is rejected, whether it was
truly dead or just slow.

## What this does not do

- No automated sweep. Nothing periodically scans for stale `running` jobs
  and calls `claim` on their behalf — reclaim only happens when something
  (a retry, an operator action) actually issues a new `claim` for that
  exact `(page_key, input_digest)`.
- No Ops-visible "stuck jobs" list. An operator has no UI to see that a
  job has been sitting `running` for 20 minutes; this is purely a
  database/RPC-level capability.
- No change to the 5-minute threshold's basis — it is a conservative
  constant, not derived from observed real-world timeout/retry behavior.
- Not verified against an actual killed OS process — the crash this
  recovers from is simulated by back-dating `started_at` directly in the
  database, not by starting a real worker and sending it `SIGKILL`
  mid-`claim`.
