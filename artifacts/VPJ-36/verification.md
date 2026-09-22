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
- UNRUN: final SQL deletion/rollback/concurrency/tombstone test after last fixes;
  Overall requested no new heavy validation during resource contention.

## Independent review

A separate reviewer identified direct authenticated Trip DELETE bypass and an
advisory/row-lock inversion. Fixed by revoking direct DELETE and using parent row
locks. Remaining legacy Proposal-first contention is bounded with a 500ms worker
lock timeout and at most three retries in the local runner. A failed attempt remains
queued. Dedicated integration assertions cover these cases; final execution awaits
a permitted resource window. Static review is not DB runtime evidence.
