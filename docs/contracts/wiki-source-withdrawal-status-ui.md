# VPJ-75 (#359) — surfacing a cited source's withdrawal status in `/ops/wiki`

Status: implemented and verified against real native PostgreSQL 16 (same
harness every prior VPJ-75 slice has used) and a real browser session
against the real production build via the repo's existing
`VP_WIKI_BROWSER_FIXTURE=1` loopback fixture. See
`artifacts/VPJ-75/wiki-read-withdrawal-status-20260917/verification.md`.

## The gap

`docs/contracts/wiki-source-withdrawal.md`'s "What this does not do" section
named this explicitly: **"No `/ops/wiki` UI for withdrawing a source or
seeing withdrawal status — this is a database/RPC-level capability only,
exercised in this slice's tests by calling the RPC directly."** The prior
slice (migration `20260916120000`) added `withdrawn_at`/`withdrawn_by`/
`withdrawal_reason` to `source_revisions` and wired the dispatch barrier
into `ops_wiki_generation_v1`, but never returned those three columns from
any read path — an Ops reviewer looking at `/ops/wiki` had no way to see
that a page's cited source had since been withdrawn, even though the
database itself already knew.

This slice covers **seeing** withdrawal status only. It does not add a
"withdraw this source" action to `/ops/wiki` — that remains a separate,
still-unbuilt write-path UI (see "What this does not do" below).

## The fix: three additive fields on an existing read RPC, rendered as an advisory

Migration `20260917100000_vpj_75_359_wiki_read_withdrawal_status.sql`
`create or replace`s `public.ops_wiki_read_v1` so each source object inside
`revisions[].sources[]` gains three fields already present on
`source_revisions` since the prior slice: `withdrawnAt`, `withdrawnBy`,
`withdrawalReason` (all `null` for a source that has never been withdrawn).
Nothing else about the function changes — same input validation, same
`current_actor()`/membership/Ops-enabled authentication, same page/revision
shape, same `jobs` array. `public.ops_wiki_generation_v1` and
`public.ops_source_revision_withdraw_v1` (the write paths) are untouched by
this migration.

`lib/server/knowledge/wiki/read-model.ts`'s `WikiRead` type gains the three
matching fields on `sources[]`. `lib/server/knowledge/wiki/http-wiki.ts`
already returns the RPC payload verbatim (see its own comment), so no
change was needed there.

`app/ops/wiki/workspace.tsx` renders a bilingual `role="alert"` line under
any source whose `withdrawnAt` is non-null, inside the existing "Sources
and original location" / "来源与原文位置" `<details>` block for each
revision (current and historical). The note names when it was withdrawn
and the recorded reason, and explicitly states that an already-generated
draft is **not** automatically retracted or hidden by this warning — matching
`docs/contracts/wiki-source-withdrawal.md`'s "no cascading revocation"
boundary. It never hides the source, the revision, or the existing
"prepare/edit a statement" links; it is advisory only, exactly like the
prior round's proposal-conflict warning.

## What this does not do

- **No withdrawal action in `/ops/wiki`.** An operator still cannot click a
  button in this UI to withdraw a source; `ops_source_revision_withdraw_v1`
  is still only exercised directly in tests, by RPC call. Building that
  action (a POST endpoint, a reason input, a confirmation step) is a
  separate, still-unbuilt slice.
- **No cascading revocation, unchanged from the prior slice.** A revision
  generated from a source *before* that source was withdrawn is not
  retroactively flagged as invalid, hidden, or blocked from further
  operator action (e.g. "prepare a statement from this version" remains
  available) — only the read-only warning is new.
- **No automated scan or notification.** Nothing proactively tells an
  operator that a page they are not currently looking at has a newly
  withdrawn source; the warning only appears when that specific page is
  read.
- **No change to any write path.** `ops_wiki_generation_v1`'s dispatch
  barrier and `ops_source_revision_withdraw_v1`'s idempotency semantics are
  exactly as the prior slice left them.
