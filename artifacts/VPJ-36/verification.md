# VPJ-36 Trip core deletion — scoped evidence

2026-09-22. Branch `codex/vpj36-trip-lifecycle`, based on main `7a05827`.
Related to #228, not Issue closure. No staging/production or real user deletion.

## Implemented

Native authenticated request/read API; recent server-session creation check;
queued module receipt; explicit asynchronous service executor; immutable terminal
receipt and persistent tombstone; Trip/child/link write fences; closed local worker.
Trips with chat/Turn references are rejected. All-data requests remain unexecuted.

## Checks

- PASS: source policy lint; TypeScript typecheck; docs consistency; diff whitespace.
  Typecheck completed before an attempted resource-stop signal (PID already gone).
- PASS: focused native HTTP fixture contract (1 test): request forwarding, bearer,
  queued/completed distinction, closed input, safe failure mapping, private/no-store.
  This is not live GoTrue or database proof.
- PASS: local runner JavaScript syntax.
- FAIL (test input, corrected): initial DB tests reused another owner's auth session;
  the existing mobile guard correctly returned SESSION_REPLACED. Synthetic actors
  now have distinct sessions. No authorization assertion was relaxed.
- FAIL (environment): last isolated DB run timed out in a simple reference lookup
  under extreme host load. Container cleanup completed. This is not a deletion pass.
- PASS: final SQL deletion/rollback/concurrency/tombstone test after fixes in
  [Privacy PostgreSQL CI](https://github.com/JTCAO515/VP-V4/actions/runs/35675303678),
  code SHA `b7938c76`. All migrations loaded into a network-disabled, disposable
  PostgreSQL container with synthetic SQL identities. This actually erased Trip
  rows and checked failure rollback, replay, archived Trips, lineage and fencing.
- PASS: focused privacy contract/security suite, 5/5.
- Pending: full Quality PR CI and deployment checks; final status belongs to PR #496.

## Independent review

A separate reviewer identified direct authenticated Trip DELETE bypass and an
advisory/row-lock inversion. Fixed by revoking direct DELETE and using parent row
locks. Remaining legacy Proposal-first contention is bounded with a 500ms worker
lock timeout and at most three attempts in the local runner. A failed transaction rolls back; read the receipt after an unavailable result.
The reviewer accepted the mitigation; runtime evidence was subsequently obtained in CI. Dedicated integration assertions now passed in the isolated CI container above.
Static review and SQL auth scaffolding do not prove live GoTrue/mobile behavior.

CI first executable SQL run found a real concurrent request-id replay defect
(second admission returned DELETION_ALREADY_REQUESTED). Admission now serializes
by request ID independently of Trip writer locks. The failing assertion remains and passed in the final isolated SQL run.
