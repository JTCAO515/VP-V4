# Profile export: bounded owner snapshot through original D2

Main accepted this sole bounded-snapshot direction and one minimal private
provenance table after identifying that old D2 facts alone cannot distinguish
legacy opaque copies. No page ledger, new source counter, job column, public RPC,
commit-digest tag or alternate proposal remains. SQL implementation awaits Main
precise candidate/unused-slot lease. Base ProfileData
0f114f679b89553017a41d18f3fbd6444bf8259b is an explicit unmerged dependency.
Parent #239 ALL1/ALL2 stays Open; ProfileData delete completion is independent.

## Real source graph and reuse

| Source | Closed projection | Original mutation authority |
| --- | --- | --- |
| public.user_profiles | ownerId, profile (eleven keys of validProfile), summary (eight keys of validSummary), savedFields, createdAt, updatedAt | seven preference saves, native pace save/pause/revoke/undo, Profile clear; service restore/delete retain original proofs/floors |
| profile_data_private.watermarks_v1 | ownerId, profileRevision, paceRevision, profileErasureFloor, paceErasureFloor | permanent original monotonic floors; independent of Profile row, original auth owner cascade |
| profile_data_private.operations_v1 | original eighteen operationKeys, validOperationRow | current owner's existing finite preview/erase/progress metadata across original sessions; cleared metadata remains null, minimal decision/replay proof retained |

Preferences are display_name/travel_pace/locale/currency/distance_unit/
temperature_unit/default_departure_time. Pace history actually stored is only
current state/revision/notice/latest operation/request and optional one-save Undo
preimage; there is no historical event producer. Export these actual values and
the real saved-field mask. System fallbacks remain unsaved and explicit/paused
pace requires the original notice. Export creates no planning/model/Trip consent.
Absent Profile is null, absent watermark is null, absent operations is []; no
fabricated default row. Present Profile requires a matching watermark tuple.
Operations are original owner metadata, not raw Profile preimages/erase bytes,
ephemeral proofs or recursive new receipts. Existing retained mixed Brief/scoped/
recovery contents stay under their own modules, not copied into this snapshot.
Memory profiles/consents/commands are an independent D4 source and producer.

Reuse public.privacy_core_export_v1 via service-only action profile_page; existing
transport already allowlists this domain. Reuse original job/lease/generation,
frozen policy/default-deny, worker registration, dispatcher, AES-GCM bundle,
module receipt, immutable original commit/execution_receipt recovery, owner
reauthenticated ticket and protected prepare/consume/download. Dispatcher and
transport need no change. Worker only adds handler and matchesReceipt before
encryption. No original privacy intent is marked completed.

NativeCoreExportStore already includes profile and accepts generic module data;
it validates receipt/bundle equality, owner/request/generation/digest/bytes/TTL,
no-store download and protected temporary file. Bind/clear/generation reject late
account responses. No new Profile-specific Swift consumer needed by source audit.
Device/old-device/target acceptance remains UNRUN.

## One closed bounded snapshot

Action input exactly `{requestId,leaseId,generation,section:"snapshot",
cursor:null,limit:1..100}`. Owner/session/epoch come only from existing validated
durable job, limit also obeys frozen pageSize. Reply exactly
`{schemaVersion:"profile-core-export/1",section:"snapshot",sourceDigest,
items:[snapshot],hasMore:false,nextCursor:null,sectionComplete:true}`.
Snapshot exactly `{ownerId,profile:null|ProfileRow,watermark:null|WatermarkRow,
operations:OperationRow[],sourceRows:{profiles:0|1,watermarks:0|1,operations:N}}`.
Operations sorted by exact requestId, owner only, no unknown keys. sourceRows is
the actual durable-row count; total <=10000 with a 10001 sentinel, entire source
UTF8 <=1000000 bytes. SQL must incrementally bound reads before aggregation.
Original maxPages/maxBytes/maxRunMs/lease clock/artifactTTL remain unchanged.

The single logical D2 item is the owner's complete snapshot. Module receipt
pages=1/rows=1 accurately counts that logical item; sourceRows gives actual
Profile/watermark/operation row counts. Null sources still yield one real-owner
inventory snapshot, with counts0, not a fake saved Profile. Never count nested
rows as top-level D2 items or claim missing source authority is empty success.
The source is read atomically under source locks, so handler consistency=snapshot
and module complete/NONE only after full bounded snapshot validation. Over-cap or
unknown source is failed/SOURCE_UNAVAILABLE; no mixed-page or truncated snapshot.

sourceDigest must be the original dispatcher's SHA256 UTF8 canonical serialization
of **`{snapshot:[snapshot]}`**, not the bare item or an independent SQL row hash.
TS recomputes it and matches returned sourceDigest, then matches actual receipt
digest/pages/rows before encryption. SQL reuses notification_private.canonical/
hash only after proving exact supported projection equivalence to exportCanonical.
Known closed ASCII field names avoid JS UTF16/SQL collation key-order divergence;
values are unrestricted lawful Unicode, original enums/time strings, nulls,
booleans, arrays and safe integers. SQL builds integer values with integer types
and normalizes all nested known integer fields (pace expectedRevision and original
operation summary/decision counters/times/epochs) to canonical integer JSON; no
arbitrary JSON numeric bodies are admitted. Fractions, exponent spellings and
negative zero of legal integer JSON inputs must compare by their numeric value,
not raw scale. No new floating amount or unknown dynamic JSON keys are included.
Actual SQL-vs-TS proof must cover all supported field shapes, Unicode supplementary
and combining/control/quote/backslash/slash characters, time fractions, safe-int
boundaries, null/absent row, every pace action/Undo and complete operation decision.
No ASCII-only fixture claim, unsupported JSON rounding, or silently omitted field.

Zero pages when maxPages stops before read means no Profile item/complete badge.
If dispatcher reads then rejects snapshot due to byte cap, producer pages1/rows1
does not match manifest pages0/rows0 and worker refuses publication. SQL rejects
any claimed Profile presence except complete/NONE/pages1/rows1/exact source digest.
It may admit a valid zero-page failure/bounded absence as absent Profile, with no
managed proof; other modules retain their real original receipt. Handler failure
before capture never counts a successful page. No hidden read-page decrement.

## Necessary provenance facts, no sensitive new store

Existing modules/artifact digest can compare current projected snapshot, but
cannot prove a historical opaque commit ever ran the new source gate. Original
commit_digest is the original input SHA256 and stays unchanged; scope/policy/
claim digest are not repurposed. No timestamp guess or caller flag can grant clear.

Proposed sole new table `export_private.profile_snapshot_provenance_v1`:

- request_id UUID NOT NULL FK core_jobs_v1(request_id) ON DELETE CASCADE;
- generation INT NOT NULL 1..3, PK(request_id,generation);
- owner_id UUID, session_id UUID, session_epoch bigint safe positive;
- committed_lease UUID, source_digest lowercaseSHA256;
- profile_revision/pace_revision/profile_floor/pace_floor nullable safe naturals;
  all null iff source has no watermark, otherwise floors<=their revisions;
- source_profile_rows/source_watermark_rows INT 0..1, source_operation_rows INT
  0..10000, total <=10000, actual Profile implies watermark;
- artifact_digest lowercaseSHA256, artifact_bytes INT1..8388608,
  commit_digest original lowercaseSHA256, completed_at and artifact_expires_at
  exact original committed times, key_id original policy key identifier.

All binding fields come from the locked actual job/source/artifact, never caller
assertions. RLS and all schema/table/function ACLs default denied to PUBLIC/anon/
authenticated/service_role. Only source-qualified original commit transaction
inserts; no user action updates/deletes it. Private immutable guard rejects update
and delete while actual parent exists; parent cascade/account cleanup stays original.
No body, source preimage, worker key/token, new user receipt or duplicate artifact.
No job columns/constraints or FK composite rewrite; insert verifies actual job
generation and owner under original job lock. One proof per actual committed
generation; exact replay verifies existing immutable proof, never rebuilds it.

## Source CAS, running jobs and lock graph

Existing lock_job policy SHARE/auth owner KEY SHARE/mobile account UPDATE/privacy
intent SHARE/job UPDATE NOWAIT remains. Snapshot source helper then takes owner
watermark SHARE NOWAIT, profile SHARE NOWAIT, operations ascending UUID SHARE
NOWAIT. Commit source check compares proposed complete Profile module digest to
the full **then-current** snapshot under those locks. Original artifact/module/
lease/generation/time qualification follows unchanged; immutable provenance is
inserted only in the same successful commit transaction after original job and
artifact are written. Source failure or proof failure rolls the entire commit back.
Maintain absolute original clock/lease checks after all added waits before publish.

Running jobs have modules=[] and no committed provenance. They are not declared
managed copies. Their collected plaintext exists only in the bounded worker. A
clear/edit before commit changes source digest (full Profile row plus original
monotonic floors and operation rows); commit CAS refuses old content, no artifact.
Commit first records genuine proof; clear then sees a managed retained copy and
changes source, making it unreadable. Original shared account lock serializes
these two paths; no separate running capture table or caller source revision.
Source updates that leave only final sensitive values equal still change original
monotonic revisions/timestamps/operation metadata and cannot revive an old digest.

After commit, existing lock_job invokes profile_source_current_v1: for any actual
Profile pages/rows>0 require valid genuine proof and exact current full-source
digest/monotonic tuple. Cover original read/validate/commit exact replay/recovery/
ticket/download_prepare/download_consume, preserving Memory/entitlement hooks.
Source-current and managed provenance are separate checks: stale proven copies
remain managed and permit later clear, but never controlled readable.
Lease expiry/reclaim, account/session/epoch replacement, revoked/frozen policy,
intent drift and original deadlines retain original denial behavior. Unknown commit
recovery remains original execution_receipt; no effects re-run, lease renewal or
new-session rebind. Historical HANDLER_MISSING bytes are not upgraded. Old custom
Profile bytes without proof stay opaque and blocked for clear even if digest
equals current source. No source bodies are leaked through currentness failures.

Profile clear original sequence is account/session -> advisory34 -> watermark ->
Profile -> ordered reverse rows -> own operation. Its original inventory_v1 locks
actual core jobs/artifacts/tickets; add necessary provenance rows to sources_v1
registry/CAS inventory with stable full (request_id,generation) ordering. Managed
qualification takes proof SHARE NOWAIT after existing source/reverse locks; no
helper acquires a job while holding a new lock in reverse D2 order. Original service
Profile delete guard watermark NOWAIT collision aborts rather than publishing stale
data. Original account cascade observes missing auth owner and is preserved.

## Precise original clear compatibility

Only original profile_data_private.inventory_v1 core-job conflict hunk changes.
Continue listing exact coreExports IDs/full rows in sourceDigest and receipt
retainedCopies. Suppress CORE_EXPORT_COPY only for profile_managed_copy_v1 proof
qualification; active unknown/custom still SOURCE_UNSUPPORTED. Qualification:

1. Immutable server proof matches real owner/request/generation/session/epoch/
   committed lease, original unmodified commit_digest, exact complete Profile
   module pages1/rows1/digest=proof source digest and original actual source counts.
2. Real original atomic job/intent/closed modules and encrypted artifact agree
   with proof: owner/request/generation/lease/key, nonce/tag/cipher lengths,
   digests/bytes, canonical original AAD and exact original clamped times. No
   currently live missing-artifact exemption. After original purge strips modules,
   no Profile copy is claimed; custom malformed remnants retain the blocker.
3. Registered locked source/retrieval hooks are exact reviewed function identities
   enforced before original controlled reads/prepare/consume. SQL dependency
   validation fails closed if replaced/missing; no mere module/flag/time proof.

Qualification does not require current source equals captured source; that is the
independent retrieval gate. Changed-source legitimate managed copies are still
safe to retain and do not block repeated clear. No ciphertext rewrite/mixed-domain
deletion/financial/provider/budget deletion/consent bypass. Original retained
coreExports/externalCopies=not_erased receipt stays honest.

Commit/consume before clear was admitted under then-current source; clear before
commit/consume denies old content. Network response/file already admitted at
consume is an external/client copy that cannot be recalled. Original generated
TTL/purge/account cascade remains; Native local selected download keeps original
session/file TTL. Server clear does not claim to recall a downloaded file.

## Exact necessary SQL/shared change list and proof

New private helpers proposed: profile_source_v1(owner UUID),
core_profile_page_v1(input JSONB), profile_commit_qualifies_v1(job,modules,lease,gen),
record_profile_provenance_v1(job), profile_source_current_v1(job),
profile_managed_copy_v1(request UUID,owner UUID), immutable provenance guard and
fixed managed-hook dependency verification. Names/signatures fixed by sole SQL
owner from this contract, not claims of already-existing functions.

Existing function hunks: export_private.lock_job_v1(UUID,BOOLEAN) adds post-original
source hook; public.privacy_core_export_v1(TEXT,JSONB) adds profile_page dispatch,
commit source qualification and post-commit atomic proof recording only;
profile_data_private.inventory_v1(UUID) precise managed conflict exemption;
profile_data_private.sources_v1() precise proof registry/FK/canonical row ordering;
profile_data_private.schema_v1() and result_data_private.schema_supported_v1()
only reviewed exact table/function/FK/catalog deltas. Preserve exhaustive unknown
app/incoming FK/typed JSON/infrastructure default-deny. No blind hash substitution,
old migration edit, broad namespace exemption or original writer/floor/RPC change.
Profile SQL original owner release reported by Main; final precise append lease
and unused migration slot still required. No SQL written in this TS worktree.
Shared export-worker.ts/CI registry modifications remain candidate until original
owner release/Main precise hunk lease. Existing modules/dispatcher/runner/coverage
need no rewrite; no new Native task/source.

Final actual proof: current ordered migration rollback/replay/catalog and canonical
all-supported-shapes equivalence; same-source registered worker -> actual PG ->
original encrypted receipt -> signed Auth -> protected download exact bytes;
owner isolation/default denied/RLS, source change before commit and after ready/
ticket/prepare-before-consume, clear/edit/revoke/session/account/policy/lease race,
old opaque no-proof blocker and stale proven repeated-clear, watermark absence/
safe floors/future explicit save, original unknown commit exact-byte recovery,
bounded snapshot caps/page-byte receipt accuracy. Fixture PG, signed Auth, generic
Native source/tests and target/device UNRUN recorded separately. No target GRANT,
key/config/Storage/provider expense/deploy/device/model action is authorized.
