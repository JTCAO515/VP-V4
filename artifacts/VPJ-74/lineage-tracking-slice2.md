# VPJ-74 slice 2: write-path lineage tracking

Follows slice 1 (`verification.md`). This closes the "PARTIAL" item from
slice 1's `acceptanceMapping.sourceRevisionLineage`: the write path now
stamps real lineage on new source revisions instead of leaving every row
`legacy` forever.

## Change

`20260914090000_vpj_74_lineage_tracking.sql`: `create or replace` on
`knowledge_review_private.ops_review_workspace_publication_v1` (the actual
`submit_statement` implementation, reached via the thin `public.ops_review_workspace`
dispatcher added in `20260914041000_vpj_16_place_questions.sql`). The only
change from the previously-merged body: the `source_revisions` INSERT now
also sets `fetched_at = clock_timestamp()` and `lineage_status = 'tracked'`.
Everything else — validation, receipts, publish/revoke branches — is
byte-for-byte identical to the version already running in production
history.

`effective_at` is deliberately still never set (see contract doc) — this
slice does not invent a basis for it.

## Real verification (same disposable local Postgres, reset and rebuilt)

`supabase migration up --local` applied this migration cleanly on top of
the full history (39 migrations total now).

1. Submitted a **new** statement with a **new** `sourceKey`
   (`test-source-two`) via the unmodified public API surface
   (`public.ops_review_workspace`). Confirmed in `source_revisions`:
   - `test-source-one` (created under the old function version, before this
     migration): `lineage_status = legacy`, `fetched_at` still null.
   - `test-source-two` (created after this migration): `lineage_status =
     tracked`, `fetched_at` is a real, non-null timestamp.
2. Re-submitted the exact same `operationId` a second time: returned the
   byte-identical receipt (idempotent replay unaffected), and
   `source_revisions` still had exactly 1 row for `test-source-two` (no
   duplicate insert, `ON CONFLICT DO NOTHING` behavior unaffected).

## Validation

`docs:check`, `git diff --check`, `lint` (268 files), `typecheck`,
`test:contract` 313/313 (0 skipped) — all PASS, unchanged from slice 1
(no new test needed: this is a body-only change to already-tested SQL
control flow, verified directly against real Postgres above rather than
duplicated as another pure-TS contract test).

## Still not done

Staging deployment, `apps/ops` UI, and `effective_at` semantics remain
open — see `unrun.md`. #358 remains OPEN.
