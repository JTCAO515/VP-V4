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

Final integration follow-up: normal main merge incorporates #650 main
85e7ec6b7969a9a5796d07c58c8b8880bada1d73, preserving the scoped-edit fourth journal,
manualOrder/reorder and both CI entries. The first project-file conflict script
failed its assertion; an unpublished merge commit retained markers and the first
reported project PASS was incorrect. This was corrected before push in f3b2252d.
Actual subsequent checks PASS: no markers, both feature/test registrations,
five existing/new journal names, project plutil, Session Swift syntax, diff check.
That failure is retained rather than converted into successful validation.

Actual UI source review then found that global incomplete coverage blocked even
individually verified sources. The original Native owner fixed fca6e06e (integrated
49bd73ff): incomplete remains an explicit partial/unknown notice, while returned
sources are filtered by exact head/source/expiry for N1 and scheduling. Unreturned
watch sources remain unavailable. Stored purpose consent survives card dismissal;
registration still does not authorize dispatch. One affected real Foundation
partial-GET/schedule/ACK and negative head/expiry/source case passed, with unchanged
prior tests reused. Main retained the initial Closed/reopened history and closed
development again only after this actual code fix.

PASS: one necessary combined unsigned `xcodebuild build-for-testing` after main
merge and the partial-source fix, with isolated derived data
`/tmp/vpj30-integrated-notification-dd-20261005`. Actual exit 0 and
`TEST BUILD SUCCEEDED` are in `/tmp/vpj30-integrated-notification-build-20261005.log`.
This compiles app/test targets and verifies the merged project/Session together;
no Simulator was booted and no device/runtime acceptance follows.

Final independent review found an actual cross-boundary topic-binding gap: the
SQL grant omitted topic while APNs used its separate factory topic. The original
SQL owner fixed only the grant (82e588c4, integrated 2ae00094). TS 4a48cef4 makes
the strict attempt include topic and requires transport environment/topic equality
before send; the APNs factory also repeats the equality check. Mismatch has zero
provider exchanges, TRANSPORT_UNAVAILABLE, no token revocation and no new attempt.
PASS: 2 targeted sender checks and 1 affected actual local CLI check. The actual
strict sender/codec versus PG matched/mismatch joint passed 2 cases, and direct
grant/cancel-race checks passed 2; unchanged earlier SQL cases are reused and the
scope remains 17 distinct SQL cases. The test/evidence-only SQL ecc3456d commit
records these exact runs. No Swift source changed, so combined unsigned compile
is reused; typecheck/diff passed after the new internal transport wire.
The earlier formal review/CI head 35bf is superseded and cannot authorize merge
of this corrected final head.

The final N3 source audit also found clock/provenance in the semantic digest via
the complete typed claim (asOf/evidence) plus claimRevision/payloadHash. An isolated
old-82 baseline with the affected actual watch fixture observed 1 PASS/1 FAIL;
the digest changed after a real review-time/expiry refresh of the same value.
Original SQL owner 76a13db8 (integrated 3b1edd2c) limits semantic content to
status/scope/applicability/itemDigest and claimType/subjectId/value. Qualification
retains and strengthens exact sourceRefs/claimRevision plus the prior owner,
session, epoch, mapping/digest/hash/item and TTL checks. The affected actual PG
run passed 2/2, 0 skips: same-value provenance/time refresh makes no outbox or
expiry extension, while a real reviewed recheck status event remains once-only
and pending/reviewer-loss negatives remain denied. This is an isolated regression
baseline/fix, not a production or CI failure. No TS/Native/permissions changed;
unchanged earlier evidence remains reused and the SQL scope is 17 distinct cases.
Previous 3dca review/green cannot authorize the new corrected head.
