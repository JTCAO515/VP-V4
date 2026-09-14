# VPJ-74 slice 3: real Staging deployment and verification

Follows slice 1 (`verification.md`, PR382) and slice 2
(`lineage-tracking-slice2.md`, PR383). This closes the remaining
`UNRUN` item from both — "Staging deployment and read-back" — against the
actual shared Staging project `dzqdzetcctkhbrhlxxgn` (the same one Vercel
Production/Preview point at), not a disposable local instance. Done with
the operator's explicit go-ahead and a supplied service_role key (used
only for this session, discarded immediately after — never committed,
never logged, never printed to output).

## Pre-flight

`supabase migration list` against linked Staging showed all 48
previously-existing migrations already `local == remote` (no drift) and
exactly the two new VPJ-74 migrations (`20260914080000`, `20260914090000`)
missing remotely — nothing else pending, nothing unexpected.

## Backup before touching anything

`supabase db dump --linked` (schema, 6242 lines / 55 tables+functions) and
`supabase db dump --linked --data-only` (7417 lines / 43 tables with data)
to local temp files. Both migrations are purely additive (new tables, new
nullable columns with a safe default, new function — no `ALTER`/`DROP` on
any pre-existing column, no data mutation), so the actual risk was low,
but a real backup was taken first regardless, matching this repo's
established practice. **The backup files were deleted immediately after
verification succeeded** (no restore was ever needed) — they contained
real Staging rows and were never meant to persist past this session.

## Push

`supabase db push --linked` applied both migrations cleanly. Re-ran
`supabase migration list`: all 50 migrations now `local == remote`, zero
mismatches.

## Read-only postcheck (before any test data)

```
users: 6, candidates: 28, publications: 27, source_revisions: 24, ontology_relations: 9
```

The 9 `ontology_relations` rows are the new seed data (correct — exactly
the closed predicate set). Every pre-existing table's row count matched
what was expected from the backup, confirming the migration touched
nothing else.

## Real end-to-end flow, against real Staging

`knowledge_review_private.settings.enabled` and `.publication_settings.enabled`
were both `false` (the established steady-state, confirmed before
touching anything) with 0 active members. Created 3 synthetic
`auth.users` (`vpj74-staging-{author,reviewer,outsider}@example.test`),
their `auth.sessions`, and 2 active `members` rows (author + reviewer;
the outsider deliberately was not added), then temporarily flipped both
settings to `true` for the duration of the test.

Ran the real vertical slice through `public.ops_review_workspace`/
`public.ops_knowledge_provenance_read_v1` via `supabase db query --linked`
with session-scoped `SET LOCAL request.jwt.claim.sub`/`request.jwt.claims`
(the same mechanism PostgREST uses, not a mock):

1. Author submitted a real payment-domain statement (subject
   `test-staging-metro`, predicate `accepts_method`, object
   `test-staging-mobile-pay`) — succeeded.
2. Reviewer reviewed it — succeeded.
3. Reviewer published it — succeeded, real `fact_id` issued.
4. Reviewer called `ops_knowledge_provenance_read_v1` — returned the
   correctly-resolved relation (`accepts_method` → `service_entity`/
   `payment_method`, zh/en labels), the source with its real
   `snippet_hash`, **`lineageStatus: "tracked"` with a real non-null
   `fetchedAt`** (confirming slice 2's write-path change is live on
   Staging too), and the `published` audit entry.
5. The outsider (authenticated, not an active member) called the same
   RPC with the same `factId` — `OPS_FORBIDDEN`, exactly as specified.

## Cleanup

Deleted every row this test created, in dependency order
(`publication_audit` → `publications` → `statement_sources` → `statements`
→ `source_revisions` → `audit` → `candidates` → `members` → `sessions` →
`users`), then restored both settings to `false`. Final postcheck matched
the pre-test baseline exactly: `users: 6, candidates: 28, publications:
27, source_revisions: 24, active_members: 0, settings_enabled: false,
pub_enabled: false`. Zero residual test data, zero change to any
pre-existing row.

## What this does and does not close

This satisfies #358's "实际Staging API/Ops读回通过" acceptance bullet for
this slice's scope. It does **not** build an `apps/ops` UI surface (still
`UNRUN` — see `unrun.md`), and it does not claim the full #358 ticket is
done — the ticket's own text requires the complete producer/consumer and
fault-verification picture, and this is one successful real-environment
pass, not an exhaustive one (no concurrent-write, no restart-recovery, no
fault-injection scenario was exercised against Staging in this slice —
those were exercised against the local disposable instance in slice 1/2
only).
