# VPJ-31 export lease clock correction — 2026-10-05

Scope: append `20261005081000_traveler_brief_export_clock.sql` only for the existing
private Brief export function, with one lease clock observation. The existing
merged `20261005060000_traveler_brief.sql` is unchanged. No new authority, provider,
permission, activation, account enrollment, or shared registry changes.

## Original observed failure

[CI run 37310639727](https://github.com/JTCAO515/VP-V4/actions/runs/37310639727),
[job 111765567443](https://github.com/JTCAO515/VP-V4/actions/runs/37310639727/job/111765567443),
source `fcb62aabf28334cd71547c26ee4a143df523058a`: FAIL, actual PostgreSQL constraint
`export_leases_check` in testcase `export exact 30s lease, reference-only projection, invalidation after source/audit/data change, complete bounds`. Exact error: `ERROR: new row for relation "export_leases" violates check constraint "export_leases_check"`. Observed
`captured_at=2026-10-05 12:43:11.306774+00` and
`expires_at=2026-10-05 12:43:41.306775+00` differ by 30.000001 seconds. Two calls to
clock_timestamp in the original INSERT crossed a microsecond. The prior local
passes did not prove that this timing-dependent path was free from failure.

## Change and actual checks

Fresh `origin/main` `b47096e4` was merged normally as `39696d9b`. The two add/add
conflicts preserve main's accepted stricter TS decoder and owner-state Auth HTTP
fixture; the old SQL is byte-identical to main. The new function retains its
signature, search_path, owner/session/source/data fences, bounded rows/bytes,
expiry checks and ACL. Only the new lease captures one timestamptz and derives
expiry from that same value plus interval '30 seconds'. The hard 30-second table
constraint is retained.

- PASS: `VP_TRAVELER_BRIEF_DB_TEST=1 node --test --test-name-pattern 'append replay|export exact' tests/integration/service-cases/brief-postgres.test.mjs`
  — 2/2, zero failed/skipped/cancelled/todo. One fresh network-disabled disposable
  PG stack replays all migrations, proves the appended function rolls back to the
  original definition, and proves replacement retains the original ACL. Default
  deny precedes synthetic fixture RPC grant. The original export regression also
  checks current source/audit invalidation, immutable lease replay, expiry,
  10,000-row/512-KiB limits and incomplete account/attachment coverage. Its new
  assertion checks actual PostgreSQL microsecond duration equals exactly 30 seconds,
  alongside the existing public closed-wire response. See `postgres.log`.
- PASS: `node --test tests/contract/service-cases/brief/export-clock.test.mjs tests/contract/service-cases/brief/sql.test.mjs`
  — 4/4. Exact body comparison permits only the capture variable/assignment and
  same-value INSERT endpoints; no other original function logic or ACL changes.
  See `contracts.log`.
- PASS: diff review and `git diff --check`; no change to the old merged migration.

UNRUN: subsequent remote CI/re-run, target migration/EXECUTE activation, real staff
or user data, physical-device/provider/production acceptance. Main/#658's sole
integrator owns combined CI and delivery. Old CI FAIL remains evidence; local PASS
on the new source does not relabel that old run or claim target activation.
