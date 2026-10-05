# Main readback / precise dependencies

First own runtime write: contract.ts; rows.ts/protocol.ts/export.ts/http.ts and
new POST route implemented. WIRE.md is one closed SQL/Native wire for review.
Shared files unchanged; no new SQL, runtime flags/config, target operation or other
thread message. Original material HEAD f1f065c8 used, no dirty copy.

Original dependencies (approval status updated below):
1. Review closed WIRE (full eight-table+legacy/new inventory, three explicit scopes,
   exact JSON shapes, root order and permanent producer/worker fence/drain design).
2. Verify unused new migration slot and create independent official SQL owner.
   This session will not write runtime SQL or reuse another task's SQL session.
3. Obtain exact release/lease original notifications scheduler/delivery-contract/
   APNs + travel_reminders_v2 fence seam, old coverage/new module entries, native
   Session/PBX/registry. Current session only owned files until then.
4. Relay WIRE to sole Native owner. Data-token preview is explicit private owner
   export; token must never reach general logs or persisted test artifacts.

Full #239/ALL1 missing/ALL2 OPEN. Own TS source isn't complete scoped runtime
until SQL + mandatory sender fence + caller integration are implemented/verified.

## Main a033c5 follow-up closed (v2)

No guessed clock-skew constant. WIRE v2 defines begin_fenced + exact leaseBudgetMs,
RPC-start monotonic process permit through actual APNs leaf writes; old begin
blocked. Owned send-budget.ts implements nonrenewable single-send permit and
monotonic barrier, drain.ts implements bounded service-only generation/nonce
finalization using EXISTING NativeConfig local service credential (no key/role
creation or activation). SQL does not fabricate an elapsed proof from wall-clock
expiry or pg_sleep. Two-phase ordinary-owner atomic fences/body erase -> trusted
monotonic barrier -> actual SQL terminal receipt, all within new request record,
no queue. Missing drain authority/ACK leaves original-op fenced/unknown. Full DTO/
minimal shared hunks/retained state inventory updated once in WIRE.

Main approved this exact narrow service finalization seam in the later relay
below. Shared sender lease remains required before shared-file writes. Target/actual
PG/APNs/Native execution not claimed from fixture tests.

Validation: focused HTTP/permit/controller tests 10 PASS, 0 FAIL, 0 SKIP (synthetic
RPCs; one actual process minimum5s duration); pnpm typecheck PASS after fixing local
BigInt target syntax and decoder narrowing; source-policy lint PASS. Shared
notifications/coverage/SQL/scripts/ios diff EMPTY versus immutable base. New
route integration build, actual PG/RLS/GoTrue, APNs leaf write, native file consumer
and target/ALL2 UNRUN pending required SQL/sender lease/Native integration.

Final wire additionally preserves erased outbox reminder-parent and
watch+semantic unique identities; deleting original unique rows alone could let
poll synthesize old delivery with a new random UUID. No source-body tombstone.

## Main approval c78355 / ca59d1 / 415c53 (2026-10-06)

Approved v2 closed wire and independently checked unused030000; Main has created
a new official SQL session sole append030000 (session ID pending COORD readback).
No further ordinary approval pending. Trusted service controller uses only existing
credential/disposable fixture and default deny; no new credentials/target grants.
Native exact shared lease granted by Main. Original notification owner
01a10a6b-02d6 release requested for scheduler/delivery-contract/APNs; NOT granted
yet, no shared writes by this session.

Old unfenced sender process/grants are outside v2 proof. Target rollout must stop/
drain old senders before claiming all dispatch covered; this target gate is UNRUN.
Own sender.ts now provides exact begin_fenced DTO and RPC-start monotonic permit
so shared scheduler integration needs a narrow call-site change after lease.

## Sender lease implemented; final Native mapping available

Main original#221 sole owner3673c342 explicit release granted this session ONLY
scheduler/delivery-contract/apns minimum hunks. Those three now consume new
begin_fenced DTO and genuine process-local permit through actual connector/write
points; no other notification production file touched. Own sender.ts removes
wall clock from dispatch authority. Own worker.test.mjs: 5 PASS0skip, including
production exchange leaf with synthetic delayed connector and real local HTTP2;
own sender DTO3 PASS0skip. A normal permit retirement/known-ACK lifetime issue
was detected and fixed; old outcomes/finish-read/no retry preserved. Typecheck PASS.
No Apple/provider/real key or deployment action.

Main acabb7 Native46b integration request: CATALOG.md provides once final IDs/
version4/selection/order and full34 producer fixture for sole Native. Owned
coverage.ts implemented; shared coverage four-file registration hunks ready, need
exact lease per original dispatch (no current shared coverage write). Native
Copy.order/fixture release is Main's separate exact handoff. LEGACY-FIXTURES.patch
is concrete minimal input-only adaptation for two original unit fixture files;
no expected assertion changes. Request exact tests fixture release before applying,
keeping the existing tests runnable with mandatory permit/new fenced SQL shape.

Current follow-up verification: own HTTP6 + sender3 + production-guard worker5 +
owned mapping3 =17 PASS0skip; unchanged original monotonic barrier5 tests/evidence
reused. pnpm typecheck PASS, source-policy lint PASS740. Shared coverage files and
original legacy sender fixture files remain unchanged pending exact lease. Sender
lease minimum production hunks ready to integrate immediately; mapping fixture
is clearly future registration producer, not current live GET evidence.

## Necessary Native fixture interop finding (sole original Native repair)

Read immutable Native46b/9db source under write-swift: NativeNotificationDataRows
fenceRows closed kind list omits outbox_parent and watch_semantic, which are actual
required permanent outbox replay fences in approved TS7be/WIRE v2. Actual rows
with these fences currently cannot preview/export in Native. New own synthetic
producer tests/fixtures/privacy/notification-data/native-trip-retained-preview.json
passes TS decoder and contains just these two retained fence kinds; no sensitive
body/token. Please relay to SAME sole Native owner to append those exact enum kinds
and consume this fixture; no TS reverse change, no new worker or matrix. Whole
scope closure still held until this genuine consumer mismatch is fixed.

Main now granted exact original delivery.test.mjs/hosted.test.mjs input fixture
release (original owner clean/no in-flight/planned writer): LEGACY-FIXTURES.patch
applied only its reviewed hunks. Original two files actual15 PASS0FAIL0skip,
including actual loopback HTTP2 and CLI composition. Expected outcomes/no retry/
payload/privacy assertions unchanged. No new matrix or runtime config/runner edit.

Integration current: normal merged immutable SQLc0135994 and Native0fa92171
(including final v4/34 visible catalog). Four exact leased coverage hunks are
implemented. IMPORTANT Native0fa still has original eight fence kinds at
NativeNotificationDataRows.swift:146; outbox_parent/watch_semantic remain omitted.
The same concrete producer fixture/finding above still requires SAME Native
owner repair; reported directory tests12 do not prove those real retained rows.
No new writer/TS reverse contract/new matrix is justified. Source closure held.

Four coverage registration hunks consumed exact Main grant: actual shared catalog
now4/34 and notification_data dispatch validates explicit nil-trip/object selection,
opaque recovery bytes and full typed outcome. Owned registered GET/POST4 tests
PASS0skip (fake authority separately labelled). Normal SQL mergec013 and latest
Native merge0fa completed; no original SQL edited. Actual signed one-scenario
Auth/HTTP runner/test prepared in owned namespace, starts/stops uniquely scoped
local Supabase + Next only, default-deny before scoped fixture grants, no APNs.
No duplicate SQL/Native matrix; prior versioned sources/evidence reused.

Final core receiver finding fixed via normal immutable Native16d72e68 integration,
not old0fa wait: exact two fence enums only plus upstream affected1 PASS0skip,
original guards/evidence retained. Actual signed Auth/HTTP PASS1/0skip + owned
cleanup provenance is artifacts/VPJ-58/notification-data-server/auth-http-r1.log
(source6d66ad62/session67943/project74b0e507/base59690) and STATUS.md. Harness private
workdir/Next log removed on successful owned cleanup, no secret log persistence.
Next generated AGENTS/next-env noise inspected/restored only in this own checkout.
Whole parent239/ALL1missing/ALL2 Open. Scope core ready for Main combined audit;
remaining necessary CI/legacy fixture integration engineering is separate.

Necessary CI registration concrete patch CI-REGISTRY.patch prepared, no shared
script written: scripts/ci-suites/db-integration.mjs ONLY VP_NOTIFICATION_EXIT_DB_TEST=1,
owned notification-data-postgres file and actual notification-data-http runner/base63320
(existing bases63360/63400 kept, no renumber/kill/assert/skip weakening). Request
original current registry owner exact additive release, then apply three hunks.
Original notifications PG fixture loads every append automatically but its service
fixture still supplies old begin. LEGACY-PG-FIXTURE.patch ONLY maps those synthetic
input calls to begin_fenced in shared fixture adapter; all test oracles, strict
errors and source/eligibility/ACL assertions unchanged. Request exact old PG fixture
release; no runtime old SQL edit. Scope core already actual signed PASS; engineering
fixtures/CI do not represent another product writer or open core capability gap.

Also actual prior material HTTP input hardcodes catalogv3 at line86; needs ONLY
CATALOG_VERSION imported constant (no expected receipt/state/source changes).
Original coverage/auth-http metadata-only notifications commands no longer match
the intentionally upgraded notifications descriptor. Preserve that old metadata
capability/oracles via retained owner metadata seam, while updating unavailable
example to an actually still-missing handler; this is a required legacy fixture
migration, not justification to weaken original outcome/privacy/no-op assertions.
Reviewable exact adaptation will stay owned until precise old fixture release.

Main8738c6 independently CODECOMPLETE recorded for owned3scope; current only single
PR integration engineering, whole239/ALL1missing/ALL2Open. Production build on the
combined source PASS (target flags disabled in child command; new API compiled).
Original dispatch/material/metadata-contract affected21 PASS0skip; material input
literalv3 is helper-only and currently PASS, not a new runtime finding or necessary
retest matrix. Registry classification accurately fails just the two new gated
files until exact additive lease; no skip/exclusion substitution.

As requested, once-only exact LEGACY-COVERAGE-AUTH.patch is now reviewable:
retain original ordinary signed owner metadata handler/proof directly, explicitly
not current GET registration; preserve all raw-token absence/lifecycle-content
absence/foreign-body/source-request-count assertions. Validate its real response
with original typed classifier (never status-only). Use legitimate current preview
shape solely for original cross-actor409 guard. Missing-delete example moves to
actual still-missing case_attachments with its exact reason; no widened allowed
error set. Parent fixture-only env restored in finally; no runtime aliases,
metadata helper erasure or grant beyond its existing owned fixture. Await exact
old auth fixture release/patch review, then one affected actual run only.

Original221 PG fixture input-only lease received; exact svc helper patch applied,
original affected full PG test running in its own network-none disposable container
with original oracles unchanged. Logs legacy-notification-pg-r1.log once complete.

Approved exact CI registry3 additions and legacy coverage/Auth patch now applied;
classification PASS and both new gated files are actually enrolled, no EXCLUDED/
skip/gate changes. Material helper tests already PASS21/current producer import,
no unnecessary literal-only delta. Prior original PG input patch run actual15PASS,
2FAIL0skip (raw legacy-notification-pg-r1.log). First failure is original strict
10-key grant oracle vs new required11-key DTO leaseBudgetMs. This assertion exits
before old attempt finish; next scheduler case idle is likely the resulting
unfinished/expired prior attempt, remains diagnosis pending repair (not accepted
idle/no retry weakening). LEGACY-PG-GRANT-SHAPE.patch only adds required field to
exact sorted key oracle and explicit integer (0,5000] + original interval bound;
all cancellation/accepted/no retry/error/ACL/source outcomes stay identical.
Current PG lease only allowed svc input; please exact Main review/additive oracle
lease before apply. Never strip mandatory field in fixture or allow extra errors.

Legacy coverage/Auth exact approved fixture adaptation actual1PASS0skip + owned
cleanupbd26a343/base59650/session77756; log now legacy-coverage-auth-r1.log. Source
027e452e; no production change/new model/provider/target. Strict original metadata
proof/foreign/no token/no content/no writes remain, current full notification GET
registration is separately proved by new actualAuth1. OriginalPG strict grant-shape
patch now physically exists (corrected expected list order matching), awaiting
specific additional oracle lease; second idle root still unconfirmed until first
failed unfinished-attempt cleanup path can execute. No blind rerun or accepted idle.

Single reviewable Draft PR created and attached: https://github.com/JTCAO515/VP-V4/pull/665
head960f1ed7, temporarily stacked base material server3c9 until required normal
main integration. All runtime/SQl/Native source in this one scoped PR, no repeated
PR. Draft explicitly retains original PG15/2 failure and additional exact oracle
lease pending; not mergeable/Ready/CI green. Accepted3scope code completion remains
separate from this engineering gate. Branch pushed actual implementation, no
provider/config/roles/fees/deployment/userdata action. Before final Ready require
strict grant-key repair/run, same-head normal CI/independent review and main base.

Mainfd5ade exact additive oracle lease GRANTED: only required leaseBudgetMs in
strict exact key list + integer>0<=5000<=original interval, no outcome/ACL/error/
noRetry changes. Patch now applied, original affected PG r2 running once. If idle
still fails root remains actual diagnosis, never accept idle/retry-to-green. Prior
r1 retained. No runtime edit/new writer/reopening completed core.

Original affected PG r2 actual17PASS0FAIL0skip on6d14684e/session10691 after only
approved exact grant key+budget oracle addition; accepted/cancel/noRetry/ACL/source
results unchanged. Second idle disappeared after first case normal finish path
executes; no runtime/poll/expected-idle change, prior r1 failed state retained.
Raw r2 log under server artifacts. All owned scope and necessary legacy fixture
integration engineering fixed. LEASE.md gives requested exact four coverage hunks
and futureCI3 additions explicit CLEAN/noinflight/planned release to Main/sole next
TS01a10e1b-e69c; no whole-file reservation. Notification PR remains one#665.
