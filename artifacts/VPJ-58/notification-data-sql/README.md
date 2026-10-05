# VPJ-58 notification data SQL v2

Owned branch `vpj58-notification-data-sql-20261006`, immutable starting commit
`7be21fd8d2a57c04d9c4ce27a279d5d152311e86`. Sole runtime file is
`supabase/migrations/20261006030000_notification_data_exit.sql` (SHA256 `58797f9ceaf09c43f007a523238cf554dc30b302ac1ae4f5d8a52f178000787a`).
No applied SQL, original dirty checkout, shared registry, TS or Native source was edited.

Implements the existing TS `notification-data/WIRE.md` v2: three explicit owner
selections, complete original column projection, exact UTF8 digest, fixed 30s
preview/CAS, real ordered export pages/proof, actual effect counts, permanent
identity/operation/device/dispatch fences, and source-free request/page inventory.
Owner/session/epoch and 5-minute reauth precede lookup or mutation. Archived and
retained deleted Trip inventories remain reachable; Trip and business results stay intact.

Trip/device erase always commits sensitive cleanup as `fenced`. The default
revoked service drain RPC issues a cryptographic nonce and generation tied to the
current owner/session/op; only the trusted TS controller's full monotonic 5s wait
can attest the duration. SQL validates the tuple/CAS and records immutable
`committedAt`, `decidedAt`, `drainProof`. It does not measure elapsed wall time.
Lost ACK recovery uses original exact bytes and may finish after the preview TTL.
Original `begin` returns blocked without token; `begin_fenced` retains all original
qualification and returns the original <=5000ms bound. Four original function
seams retain signature/config/security/ACL and fail closed on unexpected source.
INSERT guards serialize on original owner/mobile/session roots before fence reads;
original UPDATE callers retain their existing root order.

Actual verification: `pg-final.log` is 25 PASS / 0 FAIL / 0 skip, including the
umbrella test, on network-none disposable PostgreSQL 17.6.1.159 with synthetic
identity claims and fixture-only grants. It includes real TS decoders/export and
real monotonic drain waits, migration/erasure rollback, ACL/RLS/default OFF,
authority-before-feedback, full fields/legacy/device tokens, CAS/TTL/ordered pages,
unknown/foreign recovery, old ID/operation/device replays, nonce rollback/restart,
producer/dispatch concurrency, real qualified-watch semantic recurrence,
original qualification negatives and retained progress/Trip deletion. The last
capacity refinement counts retained register/revoke receipts as device source
rows; `pg-device-capacity-final.log` has 7 PASS / 0 FAIL / 0 skip on final runtime
(migration/ACL/disabled + device CAS/erase + 10001 receipt rejection). Unchanged
paths reuse the full 25-run evidence; this is not a claimed new full 26-run.
`contract-final.log`: 3 PASS / 0 skip. `lint.log`: PASS, 738 files. Diff check: PASS.
Log trailing whitespace was normalized; failure facts remain in versioned logs: r1 SQL CASE syntax error; r2 retained
null-device projection; r3 multipage fixture exceeded original Trip capacity.
Those were corrected without bypassing the original capacity constraint.

Reproduce full SQL behavior with
`VP_NOTIFICATION_EXIT_DB_TEST=1 node --experimental-strip-types --test tests/integration/privacy/notification-data-postgres.test.mjs`.
Optional explicit focuses are `VP_NOTIFICATION_EXIT_DB_FOCUS=eligibility-rollback`
and `device-capacity`; they register named cases only and make no whole-suite claim.
Contract command:
`node --experimental-strip-types --test tests/contract/privacy/notification-data-sql.test.mjs`.
For this isolated run, dependencies were temporarily linked from the immutable
TS worktree node_modules and the link was removed before commit. Both suites
require installed repository dependencies and the already available local PG image;
no package/service/credential installation. No output persists source bodies or tokens.

Main can relay this fixed branch/commit to sole TS `01a10db2-6b55` for normal
integration into its one PR and owned registry/CI wiring. No second SQL writer or
own PR is required. Actual signed Auth/HTTP, shared upgraded sender integration,
CI of the combined PR, target schema/role/GRANT/settings/credentials/Storage,
APNs/provider fees, deployment, phone and human rollout acceptance are UNRUN.
Previously issued tokens held by unupgraded processes are not magically recalled;
this v2 bound applies to upgraded bounded senders. Provider-initiated bytes remain
external accepted/unknown. Whole #239/full ALL1 missing handlers/ALL2 stay OPEN,
`allUserDataCompleted` stays false. No target capability was enabled.
