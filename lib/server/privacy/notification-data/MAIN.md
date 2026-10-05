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
