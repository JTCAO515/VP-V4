# VPJ-75 (#359) — automated scan for pages/jobs citing a withdrawn source

Status: implemented and verified against real native PostgreSQL 16 (same
harness every prior VPJ-75 slice has used) and a real browser session
against the real production build via the repo's existing
`VP_WIKI_BROWSER_FIXTURE=1` loopback fixture. See
`artifacts/VPJ-75/wiki-withdrawal-scan-20260917/verification.md`.

## The gap

`docs/contracts/wiki-source-withdrawal.md`'s "What this does not do" names
this explicitly: **"No automated scan. Nothing periodically checks
in-flight `running` jobs against newly-withdrawn sources; the barrier only
fires when a `claim` or `complete` call actually happens for that job."**
`docs/contracts/wiki-source-withdrawal-revision-flag.md` (round 19) named
the other half: its own `citedWithdrawnSources` flag "only appears when an
operator actually reads that specific page" — there was no way to see the
full picture across every page and every in-flight job without opening each
one individually.

## The fix: a read-only, all-pages/all-jobs scan

### Schema (additive only)

`knowledge_review_private.wiki_generation_jobs` gains one nullable column,
`source_revision_ids uuid[]`. It is recorded **only** at `claim()` time (both
the fresh-job-insert branch and the terminal-job-reclaim/retry branch of
`ops_wiki_generation_v1`) from the same already-validated `sourceRevisionIds`
array that branch already uses to check dispatch barrier 1 — nothing new is
accepted or validated. **Every existing check, exception, branch and
statement in `ops_wiki_generation_v1` is byte-for-byte unchanged**; the only
diff from the live function (`supabase/migrations/20260916120000_vpj_75_359_wiki_source_withdrawal.sql`)
is these two `source_revision_ids = ...` assignments, each marked `-- NEW`
in the migration. A job claimed before this migration keeps this column
`null` and is simply excluded from the scan below — its real cited sources
were never persisted anywhere queryable, and this migration does not
attempt to reconstruct them retroactively.

### New RPC: `public.ops_wiki_withdrawal_scan_v1`

Read-only (no `INSERT`/`UPDATE`/`DELETE` anywhere in its body besides the
existing dispatcher it does not touch), `security definer`, same
authentication idiom as `ops_wiki_read_v1`'s no-`pageKey` "list" branch
(`current_actor()` only — membership/enabled are enforced inside it exactly
like every other Ops RPC). Requires an exactly-empty object input. Returns:

```json
{
  "affectedRevisions": [
    { "pageKey": "...", "pageType": "...", "version": 3, "revisionId": "...", "withdrawnSourceIds": ["..."] }
  ],
  "affectedJobs": [
    { "jobId": "...", "pageKey": "...", "status": "running", "startedAt": "...", "withdrawnSourceIds": ["..."] }
  ]
}
```

- `affectedRevisions` scans **every** page's current and previous revision
  (the same two-revision scope `ops_wiki_read_v1` already exposes per page —
  this does not extend to full history) for one whose
  `source_revision_ids` intersects a withdrawn source.
- `affectedJobs` scans every `queued`/`running` job whose (new, possibly
  `null`) `source_revision_ids` intersects a withdrawn source — this is
  exactly the "in-flight job stuck because barrier 2 rejected its
  completion" case named in the gap above.
- Neither list calls out to any external service, mutates any row, or
  changes any job/revision's status. It is strictly a correlation report.

### HTTP + UI

`GET /api/ops/wiki?scan=withdrawn` (via `lib/server/knowledge/wiki/http-wiki.ts`)
calls this RPC instead of `ops_wiki_read_v1`; it is the one other single-key
query this endpoint accepts (alongside no params and `pageKey`), mutually
exclusive with `pageKey` by construction. The GET/POST behavior this
endpoint already had (query validation for `pageKey`, the `withdraw_source`
write action, error mapping) is unchanged.

`app/ops/wiki/workspace.tsx`'s landing view (shown before any specific page
is selected) fetches this alongside the existing "latest 50 pages" list, on
its own schedule and independently of page selection — a scan failure never
blocks or blanks the page list/detail the operator is actually using. When
non-empty, it renders a bilingual advisory panel listing every affected page
version (clickable, loads that page) and every affected running job
(clickable via its page key), each with how many of its cited sources are
withdrawn.

## What this does not do

- **No automatic action.** Nothing is cancelled, hidden, retracted, merged
  or retried by this scan — it is advisory only, matching every prior
  withdrawal slice's boundary.
- **No periodic/background execution.** This is a pull-based RPC the UI
  polls on its own existing refresh cadence (same 25s interval the page list
  already uses); there is no server-side cron, queue consumer, or
  notification (email/webhook/etc.).
- **No reconstruction of pre-migration job state.** A job claimed before
  this migration has `source_revision_ids = null` and is excluded from
  `affectedJobs`, not guessed at from `input_digest` or any other field.
- **No full revision history.** `affectedRevisions` only covers the current
  and immediately-previous revision per page, identical to
  `ops_wiki_read_v1`'s existing scope — an older revision citing a
  since-withdrawn source is not reported.
- **No change to any dispatch barrier, idempotency semantics, or the
  `ops_source_revision_withdraw_v1` write path.** Those are exactly as
  documented in `docs/contracts/wiki-source-withdrawal.md`.
- **No real model call, RMB reconciliation, or Docling integration** —
  none of those were in scope and none are claimed done.
