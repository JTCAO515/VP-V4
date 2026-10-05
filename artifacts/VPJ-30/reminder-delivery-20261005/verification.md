# #221 server implementation evidence

Base: 4dbde74126206e8ef4229497b21d1c46f85578e8. Owned branch:
codex/vpj30-reminder-delivery-server-20261005. The initial backend checkpoint
below is retained; final integrated source and evidence are recorded afterward.

Implemented: closed v2 commands/views and exact canonical mutation ACK,
cancelled-before-apply recovery contract, source provenance, purpose and quiet
hours DTOs, opaque exact Trip/source resolution, default-disabled notification
runtime, dedicated bounded RPC, finite scheduler, real HTTP/2/ES256 APNs transport
with injected credentials, and separately versioned lease/source-bound metadata
export adapter. No existing Task executor or worker runner was changed.

PASS: new server behavior tests 11/11, 0 skipped; separate synthetic authenticated
HTTP security tests 4/4, 0 skipped. Existing v1 reminder tests 18/18 were run once
and reused. The APNs transport's actual HTTP/2 network exchange was exercised only
against a local synthetic endpoint. JWT/SDK HTTP tests use synthetic keys and
intercepted requests; they do not prove target Auth/database operation.

PASS: source lint, TypeScript check and Next.js production build (new routes
included). Build is backend/runtime verification, not device/UI acceptance.

Original failures retained: the first shared dependency check could not find
@apple/app-store-server-library; an isolated frozen offline install restored the
declared dependencies and typecheck passed. One initial test assertion confused
ACK_UNKNOWN (code) with unknown (kind); correcting that fixture passed the affected
test. No runtime guard or assertion was weakened.

UNRUN: actual target GRANT/permissions, GoTrue/full deployed HTTP, real APNs
credentials/team/topic, actual push send, OS authorization/device delivery,
physical iPhone, target deployment, actual user export/delete and production.
No credentials/configuration, payment, grants, target data or device permission
prompt was changed. APNs accepted is a provider handoff, never delivered. Unknown
never authorizes another attempt. Cancellation after the serialized handoff
stops future work and preserves the last-known outcome without promising recall.

SQL and Native owners' final source/evidence plus actual TS/SQL producer-consumer
joint evidence will be appended after integration, preserving prior FAIL/UNRUN.

Formal host follow-up: the initial runtime factory had no production caller.
This was a real implementation gap. The dedicated finite CLI/host now composes
the existing notification runtime and RPC, with closed profiles/parameters and
content-free counters. PASS 2 actual host tests: disabled no credential reads
(guarded Proxy plus actual CLI process), and actual CLI local loopback
HTTP/HTTP2 composition accepts one synthetic request and exits after two ticks.
Neither test contacts Apple. No daemon/config/target deployment was added.

PASS 1 affected abort-during-unresolved-transport case: same durable attempt is
finished unknown, never sent a second time. PASS existing registry classification
and its 9 governance cases; only the new notification opt-in/root/file were added.
Manual device revoke now permits an actual authorized OS declaration with
active=false; the affected parser and actual Native behavior cases cover it.

Final owned code integration is complete. Native source fb92c8a8375769ab6e12aefea6268b74e73ed1a6
was normally cherry-picked as ee7f5ea9; SQL 0db2bb6f and final runtime
501acd857c205608023ab724010179d7c6d4bc3e were normally cherry-picked as
9d92d427 and a8cc43f9. SQL's test/evidence-only 01a218a0 adds actual two-RPC
cancel/begin contention without changing the SQL runtime. Native App/Session
hunks preserve existing journals. Any subsequently merged scoped-edit fourth
journal must be preserved during normal main integration.

SQL source evidence is verified by normal reading of the original logs:
full owned run 17 PASS, 0 FAIL/skip; last source/OS-state fixes 3 affected PASS;
actual cancel/begin contention 2 affected PASS (including history/ACL setup).
These are 17 distinct cases across reused runs, not 22 distinct cases. The actual
TS scheduler/codec and metadata export adapter consumed real disposable PG source.
N3 used actual publication, approved mapping, original confirmed support and #207
reviewed/acked recheck; pending review/reviewer loss and source withdrawal denied
the notification. No user JWT impersonation or old private payload fallback.
Task result N1 plus Memory/consent/source drift and exact lease-bound export were
also observed. Detailed failures and evidence:
[SQL EVIDENCE](../sql-delivery-20261005/EVIDENCE.md).

Native's actual Foundation run 10 PASS and last manual-revoke affected case 1 PASS
are reused, together with unsigned generic app/test-target compile and actual TS
Unicode/slash digest producer agreement. This is compile/Foundation protocol
evidence, not iOS runtime/permission/APNs delivery. Detailed source evidence:
[Native evidence](../native-delivery-20261005.md).

The final PR still requires its exact-head CI and independent protected review.
All original target/device/production UNRUN above remain; development-complete
source does not activate database permissions, APNs credentials or deployment.
