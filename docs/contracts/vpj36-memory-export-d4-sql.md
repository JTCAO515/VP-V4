# #228 bounded D4 Memory export SQL — Main approval checkpoint

Base9b7ad109a828b160cb5ddfccb253b7a8f7f2216d. Independent codex/vpj36-memory-export-sql-d4-20261003; only contract now, no runtime SQL before scope/lock approval. Proposed free slot20261003210000_vpj36_memory_export_source_fence.sql (no dependency on190/200/180; no old applied migration edit). TS owns exporter/worker changes. This is canonical Memory export only, not wholeD4/materials/bulk delete/new permission.

## Fixed interface and six existing sources

Extend existing default-revoked `public.privacy_core_export_v1(p_action text,p_input jsonb)` with service-only `memory_page`. Exact input `{requestId,leaseId,generation,section,cursor:null|UUID,limit:1..100}`, never caller owner/source revision/digest/epoch. Exact reply `{schemaVersion:"memory-core-export/1",section,sourceRevision,items,hasMore,nextCursor:null|UUID,sectionComplete}`. Current durable lease/profile/current original admission owner/session/epoch still authoritative. All new helpers/table API rights revoked; no new GRANT/role/public source endpoint/target activation.

Closed rows/UUID ascending anchors agree with original TS draft:
- profiles (public.memory_profiles joined owner memory_consents): memoryId/revision/state/constraintKind/summary/sourceReceiptId/consentId/consentStatus/createdAt/updatedAt; current summary only; revoked consent/deleted profile summary null, no old revision body.
- consents (public.memory_consents): consentId/status/createdAt/updatedAt.
- receipts (public.memory_receipts): receiptId/memoryId/eventState/sourceKind/createdAt.
- consumerReferences (public.memory_consumer_receipts): referenceId/memoryId/sourceReceiptId/consumerKind/turnId/proposalId/constraintKind/createdAt. Reference metadata only, no referenced content or Memory mutation.
- commands (memory_private.native_command_receipts_v1): commandId/memoryId/consentId/action/state/revision/sourceReceiptId/createdAt. Exact scalar state/revision/sourceReceiptId extraction from the generated original receipt, **not** rawreceipt/input_digest; nullable consent-create fields preserved.
- undoMetadata (memory_private.native_update_preimages_v1): commandId/memoryId/consentId/resultingRevision/expiresAt. Never select prior_summary; metadata is not Undo permission. Current retained metadata may include past expiresAt, clearly expired by timestamp; no time-varying filtering that would silently change page data without revision. Revocation/deletion already physically scrubs these rows.

Cursor anchor must exist in this same section/owner or INVALID_EXPORT_CURSOR; unknown/foreign/deleted uniformly rejected. Page bounded by policy pageSize and code100, no row-to-JSON fallback. First memory_page creates/reads private owner source revision and captures it in the job, all six sections/empty terminal pages use that exact snapshot. sourceRevision positive safe integer, server-only; no request field provides authority.

## Concrete locking / source counter / currentness

Existing130 native commands: auth.users KEY SHARE NOWAIT -> mobile account UPDATE via guard/native_session -> consent/profile -> receipt/preimage. Older create_v2 actually locks profile then consent, undo/state locks profile, revoke locks consent, each old definer guard pins mobile account; do not reorder/rewrite those writers.

New per-owner source revision bumped transactionally by BEFORE ROW insert/update/delete on profiles/consents/receipts/consumerReferences/native command receipts/native Undo metadata. No-op metadata writes may conservatively advance revision. Trigger is reached after an existing row lock: therefore it takes auth.users KEY SHARE NOWAIT then **mobile account UPDATE NOWAIT**, then counter UPDATE; never waits on a new job/artifact/ticket/profile/consent. Old authorised RPC already holds account so reentrant. Privileged direct table mutation encountering an export account lock fails NOWAIT before it commits; it is not allowed to bypass the source fence. Account deletion skips counter recreation after root owner is gone and cascades source row. Owner moves (trusted old service table boundary) invalidate both owners in sorted UUID order/NOWAIT, not the client owner.

Export uses existing170 chain policy SHARE NOWAIT -> auth user KEY SHARE NOWAIT -> mobile account UPDATE -> admission session -> privacy intent -> job UPDATE -> source counter SHARE/UPDATE (capture) -> immutable source MVCC reads **without profile/consent FOR UPDATE/SHARE**. It never waits for a Memory row while holding counter. Writer never takes job lock. Both normal paths share the account prefix, so no account/profile/counter/job lock inversion; no hash-of-read-content substitute.

Append adds nullable memory_source_revision to job. NULL old job has no Memory payload/fence and stays truthful old HANDLER_MISSING; never relabel old module. First memory_page sets it to the real source counter. Existing private lock_job_v1 adds source-current check after its job/account locks for every later validate/trip_page/commit/execution_receipt/ticket/download_prepare/download_consume; memory_page itself is closed branch under same lease. Atomic commit carrying any non-unavailable Memory module requires captured revision, cannot publish a Memory summary without this authority. Mutations after collection deny stale commit; mutations after ready deny ticket/prepare/consume and cannot expose old summary via a new controlled download. Unknown/ACK remains uncertain, no alternate artifact/new lease under stale job.

Generated bytes may remain private/inaccessible until existing TTL/purge/account cascade; mutation triggers do **not** take export-job locks or eagerly delete ciphertext. Already externally saved files cannot be recalled. Ready metadata is not a summary/data disclosure. New Memory jobs fail closed after source drift, not automatically rebased to newer data. This conservative owner-wide invalidation includes even metadata-only changed receipts/references.

## Exact minimal append adaptations to review

1. New private source-counter table/helper and narrow source triggers (no old Memory writer body edits/grants, no preimages copied).
2. Existing170 lock_job_v1 return path checks captured source revision under its current account/job lock chain, helper API-revoked.
3. Existing170 single entry adds exact memory_page input/role branch and the pre-commit mandatory captured-source guard; original actions/replies/ACL unchanged. Confirm exact dependency-body matching before replacing function definitions, fail closed on drift, do not replace whole old files.

Necessary targeted local evidence after approval: six real sources/closed rows/owner cursor/single revision; native create/update/revoke/delete and reference/Undo scrub bump; mutation between pages and after ready blocks commit/ticket/prepare/consume; real two-session old writer versus exporter lock interleave with bounded NOWAIT and no partial writes; actual API denial distinct from administrator synthetic success. No new whole D2/D3/full-account matrix or target mutation.
