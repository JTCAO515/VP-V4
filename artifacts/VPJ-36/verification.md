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

## D1 continuation — 2026-09-26, related to #504

Base `c74c2ba66fd6922f2d815e0667f36768650b0cee` includes PR #496 and #549.
This slice adds a service-only queue reader, a disabled-by-default bounded Staging
worker, native request/receipt UI, a Keychain request journal and Trip screen
cache eviction. It does not call the StoreKit owner export/erase RPC or advance
`all-user-data-v1`; every Trip receipt still has `allUserDataCompleted: false`.

- PASS: `pnpm check` (lint, typecheck, Web build and static tests),
  `pnpm docs:check`, `git diff --check`.
- PASS: `pnpm test:unit` 148/148 and `pnpm test:contract` 681/681.
- PASS: focused privacy security 1/1. Broad `pnpm test:security` ran
  177 PASS, 0 FAIL, 1 SKIP: unrelated AI-14 disposable identity target was
  not configured; its suite outcome was `incomplete`, not a full PASS.
- PASS: network-disabled PostgreSQL privacy suite 1/1, including replay,
  other/old session, admission versus new chat link, proposal and writer races,
  rollback after an injected fault and the new service-only queue reader.
- PASS: `supabase-rls` DB integration lane 18/18 with a unique disposable
  Supabase stack. The D1 case used real synthetic GoTrue JWTs through a
  loopback Next HTTP route, then the existing local worker, PostgreSQL
  erasure and owner GET readback. Other actor, same-key different Trip and
  server-expired session were rejected. This is local integration, not Staging.
- PASS: iPhone 17 Pro iOS 26.5 Simulator `NativeTripStateTests` 13/13;
  the D1 case checked 202→queued, local cache hiding, offline status failure,
  preserved Keychain request ID, and reconnect→completed. Result bundle:
  `Test-VisePanda-2026.09.26_22-01-21-+0800.xcresult` under Xcode DerivedData.
- OBSERVED: `pnpm db:verify` reported `not-configured` for user JWT, Ops JWT
  and worker pooler connection probes; it did not connect to a deployed DB.

The first broad checks failed because this new worktree lacked the exact
`@apple/app-store-server-library` dependency. `pnpm install --frozen-lockfile`
restored the lockfile-resolved dependencies; the same checks then passed.
An initial isolated SQL run lacked the test fixture's `auth.role()` helper;
the fixture now models its JWT role claim and the rerun passed. No production
grant or RLS check was weakened.

### PR #551 review follow-up

Main's independent review found that a second Trip deletion could retain the
first Trip's `completed` receipt if the second POST failed. The native store now
clears the old receipt when a new confirmed request is journaled, drops any
receipt whose request ID differs from the reconnected Keychain request, and
leaves no old completion after a definite admission rejection. Receipt
validation now requires `queued` to have no completion time and `completed`
to carry a parseable UTC timestamp. PASS: the updated Simulator state suite
14/14, including a completed first Trip followed by an uncertain second POST
and malformed receipt counterexamples. The final result bundle is
`Test-VisePanda-2026.09.26_22-12-52-+0800.xcresult` under Xcode DerivedData.

After #550 merged, this PR rebased onto main `ac16545c`. The combined migration
history and affected paths were rechecked: PASS `pnpm check`, unit 148/148,
contract 681/681, `postgres` DB lane 125/125 and `supabase-rls` lane 18/18.
The latter includes a loopback Next HTTP and local worker run with the new
VPJ-35 migration present. PASS native Simulator state suite 14/14; final
post-rebase bundle `Test-VisePanda-2026.09.26_22-16-19-+0800.xcresult`.
No shared Staging or real-user deletion was performed during rebase checks.

One further display guard clears the previous Trip's receipt as soon as the
user selects or creates another Trip, and before a new deletion request is
written to Keychain. This also covers a Keychain write failure. PASS: the
Simulator state suite remained 14/14, bundle
`Test-VisePanda-2026.09.26_22-19-15-+0800.xcresult`.
