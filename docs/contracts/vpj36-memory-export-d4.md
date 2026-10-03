# VPJ-36 D4 bounded Memory export — proposed SQL/consumer contract

Owned outcome: Memory joins the existing request-bound core export and protected
artifact/download chain. Reuse existing Native Memory delete/Undo/revoke authorities.
No new Memory writer, material producer, raw prompt/OCR/media, Storage, role/grant,
operator policy seed or target execution. Server user_artifact remains unavailable:
C0 stores are synthetic and device screenshot inbox is a separate local producer.
This completes this bounded Memory backend outcome, not all D4/bulk deletion/materials.

## Existing producer and disclosure limits

Current canonical Memory profiles, consents, lifecycle receipts, consumer references
and130 native command receipts are real durable producers. Deleted profiles clear
summary; consent revocation masks ordinary summary and scrubs private Undo preimages.
Export follows that hiding boundary: deleted/revoked summary is null. No prior_summary,
input_digest, raw command receipt, credentials, model prompts or source artifact body.
Undo metadata is a retention/reference record, never a usable Undo permission; expired
metadata may be omitted or clearly reported expired, with no expired/deleted body.

## Proposed append-only SQL extension for Main review

Existing single public privacy_core_export_v1(action,input) gains service-only
memory_page; all API EXECUTE stays default revoked. Exact input:
`{requestId,leaseId,generation,section,cursor:null|UUID,limit:1..100}`.
Owner comes from the durable validated export lease. No client/source owner/consent
or sourceRevision argument. Existing frozen/current policy and actor/session apply.

Closed reply: `{schemaVersion:"memory-core-export/1",section,sourceRevision,items,
hasMore,nextCursor:null|UUID,sectionComplete}`. sourceRevision is positive safe integer.
Each section uses ascending exact UUID keyset, nextCursor equals last delivered anchor;
unknown/foreign/deleted cursor fails, not empty successful data. Every section/page
in a job uses the same source revision; empty terminal pages remain explicit.

| Section | Closed row fields | Anchor |
| --- | --- | --- |
| profiles | memoryId,revision,state,constraintKind,summary,sourceReceiptId,consentId,consentStatus,createdAt,updatedAt | memoryId |
| consents | consentId,status,createdAt,updatedAt | consentId |
| receipts | receiptId,memoryId,eventState,sourceKind,createdAt | receiptId |
| consumerReferences | referenceId,memoryId,sourceReceiptId,consumerKind,turnId:null|UUID,proposalId:null|UUID,constraintKind,createdAt | referenceId |
| commands | commandId,memoryId:null|UUID,consentId,action,state:null|string,revision:null|positiveSafeInt,sourceReceiptId:null|UUID,createdAt | commandId |
| undoMetadata | commandId,memoryId,consentId,resultingRevision,expiresAt | commandId |

UUIDs preserve database canonical form; timestamps follow source UTC/RFC3339, not a
client freshness grant. Summary is null or bounded1..500 Unicode characters;
profile revision positive safe integer. All other enums match current Memory domain.
No arbitrary columns/to_jsonb(row) fallback or raw operation body.

## Required deletion/revocation and concurrent-write fence

SQL owner must fix exact source-counter triggers and lock order before implementation.
A private per-owner Memory source revision changes transactionally with relevant
profile/consent/lifecycle/reference/command mutations. First memory_page captures it
inside the existing job; subsequent page/validate/commit matches it atomically.
Memory changes after collection cannot publish an old summary. Ready jobs carrying
Memory also recheck the captured source revision on ticket/prepare/consume; deletion,
revocation or update must not leave a new controlled readable copy of old summary.
Already externally saved copies cannot be recalled. Existing generated artifact TTL,
purge and account cascades handle inaccessible bytes; no direct source deletion.

No fence state is accepted from clients or inferred from UUID/digest. Profile delete/
consent revoke continue using original Memory authorities and preimage scrub triggers.
Do not lock a Memory profile while holding a new source row in reverse writer order;
submit exact proposed lock graph/currentness semantics to Main before SQL. A missing
new authority keeps the Memory module unavailable/partial and cannot fabricate PASS.

## Old jobs and immutable artifacts

Old ready_partial artifacts with memory HANDLER_MISSING stay exactly that; do not
upgrade their module receipt or mutate ciphertext. Only a current running lease may
call memory_page and capture a Memory fence, and a new worker can include Memory
only after its reader succeeded. Commit must require a captured matching fence for
any memory receipt with collected pages; no client-set memoryPresent shortcut.
Ready artifacts that actually contain Memory revalidate that source on every ticket,
prepare and consume. Jobs that never exported Memory carry no new fence and retain
existing D2 semantics. A separate explicit request creates a new eligible artifact;
old request replay never retrofits Memory, expands scope or refreshes deadlines.


## Native material responsibilities observed (read-only)

NativeScreenshotInbox is a real persistent device producer: owner-hash directory,
protected atomic bytes, backup exclusion, <=12MB/digest check, <=24h TTL and access
recheck. Review cancel/disappear/success deletes its owned receipt; Trip view calls
deleteAll for local account/deletion/abandoned-review events and blocks continuation
on cleanup failure. No server copy or raw OCR is implied. That is existing lifecycle
code, not full-account acceptance: cleanup hooks are view-scoped, and NativeSession
has no independently registered ScreenshotInbox export/account-handler dispatcher.
D2 core export currently has no owner-explicit local material-selection/original
file export handler. Device-side crash/relaunch/global account cleanup and integrating
those files into an accurate all-module receipt remain distinct Native/material
scope for its future sole owner. No N/A claim, no server-material invention, no Swift
change or device validation in this Memory backend slice.


Producer mirrors the SQL private reader progress: pages/rows count genuine validated
pages once per exact section/cursor/limit request, all6 terminal sections are needed
for complete/LIVE_TRAVERSAL. A bounded partial preserves a real nonzero collected
prefix only. If the byte cap rejects a just-read page, producer refuses publication
rather than lowering manifest counters to hide that SQL read. Missing authority is
never terminal empty data. No source-counter or collection authority is created
from this local accounting; SQL remains the atomic authority.
