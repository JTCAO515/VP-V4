# VPJ-07 durable Turn scheduling preparation

Scope: #195 repository preparation; not complete Ask acceptance. Adds an explicitly admitted, content-free PostgreSQL work queue linked to existing `turns`, a bounded TypeScript consumer, and isolated database tests. No HTTP route, scheduler, input/answer storage, provider call, user consumption or remote migration is enabled.

## Implemented behavior

- Only `service_role` may enqueue, claim or finish. Ordinary roles cannot read the private queue or invoke its internal functions. Admission checks the existing Turn owner, active thread and originating Auth session; queue retries cannot change session or retry limits.
- Lease tokens and database time fence late/duplicate completion. Retryable failures requeue within a maximum of five attempts; exhausted/crashed final attempts quarantine and emit one failed terminal event.
- Existing cancellation and worker completion serialize on the same Turn row/event stream. Completion rechecks session/mobile replacement/thread status. The consumer aborts bounded execution and leaves unknown work recoverable; it never claims exactly-once provider billing.
- Native account, Auth session, Turn and thread locks protect writeback. A claim handles at most one candidate after acquiring entity locks; an `empty` response can mean stale-candidate cleanup, so a future scheduler must keep polling. This avoids accumulating opposite-order owner locks.
- Future execution must enforce the existing policy and durable budget ledger on every provider attempt, validate and persist the result before returning `completed`. This metadata foundation grants no provider or Trip mutation capability.

## Evidence

The opt-in test command is `VP_TURN_DB_TEST=1 node --experimental-strip-types --test tests/integration/turn/durable-work.test.mjs`. It creates and removes a unique PostgreSQL 17.6 container with `--network none`, no published ports, a private Unix socket and the existing pinned Supabase image. It applies all 29 application migrations transactionally over minimal Auth/session table and SQL-claim fixtures, including native guards and confirmation authority. Existing Turn/event JSON is compared before and after migration29.

Final isolated PostgreSQL run: **10 passed, 0 failed, 0 skipped**. Covered: duplicate admission, concurrent SQL claim/finish, stale token, forced lease expiry, retry success/exhaustion, real cancellation RPC races, sequential session revocation/mobile replacement/archive rejection, role isolation, deletion cascade, TypeScript abort, actual SIGKILL and fresh-process recovery, and multi-owner competing claimers. This is real PostgreSQL lock/role/crash evidence; it is not GoTrue/JWT or remote acceptance. Session revocation/replacement tests are sequential and do not establish all concurrent Auth lifecycle races.

Independent draft review found a cross-owner lock accumulation deadlock; fixed by returning after the first candidate's entity locks. The review also identified unbounded test cleanup on early child exit; fixed with process-state checks and bounded kill waiting. A repeat under concurrent Xcode load exposed a test's one-second lease expiring during fixture preparation; test leases now use the supported five-minute bound and expire explicitly where required.

`pnpm check` passed. Unit92, contract199 and e2e40 passed. Integration19 passed/32 skipped; security98 passed/1 skipped (unconfigured explicit Supabase). The isolated Turn DB suite separately runs its opt-in cases. `pnpm db:verify` disclosed all connection probes unconfigured and did not connect remotely. Desktop/390px browser9 passed via the existing installed browser (`pnpm exec playwright test --config playwright.config.mjs --workers=1`). The wrapper's Chromium download stalled and was interrupted; its exit143 is not a browser failure. Generic Simulator build passed. Direct unsigned Simulator testing failed three Keychain-dependent Trip state tests and was interrupted; the repository's ad-hoc signed `scripts/ios/ci.py` is the verification path for those tests and is still running. Final review results are recorded when completed; see `commands.jsonl` and `unrun.md`.

## Compatibility and rollback

Migration29 is append-only, adds no user-facing policies, alters no existing RPC body and preserves prior Turn/events. Revert/disable the opt-in consumer and stop admission/polling to roll back application use; retain the applied schema/history and existing records. No table drop, history rewrite or restoration of revoked/deleted data is authorized. Staging remains at the previously verified26; applying27–29 requires its explicit environment gate.
