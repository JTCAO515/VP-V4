# ResultData unique runtime wire, 2026-10-07

Base main bdb92b2b7dabf64b4d89fee1b657dcf06998dded. Sole TS/integrator
vpj58-result-data-server-20261007. Owned new privacy/result-data, native API and
own tests only. Existing catalog, registry, SQL and Native untouched. This wire
is the sole TS/SQL/Native source; no separate guessed Swift or SQL JSON contract.
No target activation/provider/account/Storage/fee/production authority.

## Actual source gap and accepted result

Original results catalog core export has deleteHandler null. Original
withdraw_result_artifact_v1 is service-only, lifecycle+withdrawal-event only;
it does not erase revisions/content. ConversationData deletes a whole selected
conversation/thread with its exclusive results; it cannot select one artifact
and preserve source Conversation/goal/message/Task/Turn/Trip/explicitMemory.

Ordinary authenticated owner lists ACTUAL eligible stored artifacts (active AND
withdrawn, historical AND current), explicitly selects ONE artifact and ALL its
revisions/events, reads provenance/impact/counts/boundaries/blockers, confirms
exact source CAS/operation within fixed30s, erases selected sensitive store and
proven exclusive result copies, gets immutable exact-byte receipt, recovers lost
ACK with original bytes. Finite own operation inventory permits explicit1..20
transient preview cleanup; permanent identities remain enumerable. No generic
engine, one-revision deletion, cross-result cascade, TripProposal apply or raw
source input erasure.

## Source graph audit and actual relationships

Read against this exact base:
- 20260927030000_vpj79_comparison_results.sql: artifact id; all immutable
  result_revisions composite(artifact_id,revision); all result_events bigint ID.
  Owner+task+goal+input_message+Trip sources. Withdrawal retains content.
- 20260927055000_vpj79_exact_trip_results.sql and
  20261002110000_vpj79_change_proposal_reference.sql: original exact Trip-link
  revision/operation and proposal_id FK. All source projections must remain.
- 20261003110000_vpj79_five_result_lifecycle.sql: evidence_basis; artifact
  source_result_id SELF FK ON DELETE CASCADE, source_turn_id; historical
  decision content.comparisonRef; journey-draft source and practical sourceTurn.
  Current public choose_result_decision_v2 and service publisher preserve their
  original locks/errors. DELETE of a comparison must NOT silently erase decision
  artifacts via FK, including withdrawn/historical dependencies. Recheck ALL
  historical revision JSON, not only source_result_id/latest revision.
- 20261003090000_vpj78_selected_message_sources.sql and
  20261003120000_vpj78_result_v2_context_compat.sql: message-source receipts
  input_sources/captured_sources/accepted_receipt hold result references. Preserve
  original message/receipt; ANY reverse dependent is CONVERSATION_SOURCE_REFERENCE.
- 20260927060000_vpj80_planning_comparison.sql: planning_comparisons.artifact_id
  unique but no result FK. Its turn/task/message unique identity maps job to ONE
  selected artifact. Job and source rows are RETAINED. Active queued/paused job,
  source work/public turn/claim/checkpoint/action/budget unknown state BLOCK.
- 20261003150000_vpj80_complete_worker_authority.sql: completion proof contains
  raw result content; completed receipt contains artifact reference. Unique
  execution run task/turn -> planning job; origin/output/window/claim -> run.
  Only completed, owner-qualified proof+receipt+job+run equality can admit run
  and its children as exclusive copies. Other proof/receipt/run/artifact/turn/
  scope-attempt references or missing/unknown completion BLOCK, never assume
  ownership of tables lacking owner_id from turn alone. All exact binding tuple
  fields (owner/task/turn/lease/textPolicy/planningPolicy/scope/attempt and basis
  digests) qualify before erasure. Preserve model_budget_attempts/scopes, grants,
  financial dispatches and usage integrity. Do not cascade financial rows.
- 20261003060000_vpj78_v2_model_local_journal.sql: request_id identity; unique
  turn->planning job; binding is original13-field tuple, NOT runId/executionId.
  Select journal only via exclusive planning job/artifact and original owner/
  task/turn/scope/attempt/binding equality. Completed response_recorded/unknown_at
  null required. Delete entire exclusive journal (output_wire and response
  observation), enumerate permanent request identity; do not redact a guessed
  field or discard provider unknown/settlement obligations.
- planning job deletion would CASCADE planning_intake_bindings, place_checkpoint,
  model_attempt_binding, local_journal and execution_runs. THEREFORE DO NOT DELETE
  planning_comparisons. Preserve intake binding, checkpoints, attempt binding,
  action receipts/observations, model dispatches and original input/text. Count
  all retained selected source rows in planningSources. If any has a result
  dependency/body copy that cannot be exclusively qualified, BLOCK.
- 20261005030000_reminder_delivery.sql: source.kind task_result/sourceId and
  notification_private.dismissals(source_kind,source_id) store result reference;
  all reminders/outbox/deliveries/operations/previews/export copies must be
  audited including pending/expired/withdrawn records, NOT only live reminders.
- 20261005060000_traveler_brief.sql: briefs/previews sources, audit field_keys,
  operations.request_bytes BYTEA with original JSON and receipt are mixed
  snapshots. Decode stored original request_bytes before reference scan; invalid
  bytes/source graph fail closed. References block BRIEF_REFERENCE.
- Guide/readiness/scoped-edit and all application stored JSON/scalar refs:
  source snapshot may include result/turn binding. Reservation artifact_reference
is rejected by original service/evidence; it is not an accepted result source
or a fabricated working dependency. A stored unexpected reference still blocks.
Lodging/readiness consumers resolve original result refs through ordinary owner
readers; preserve original source and reject persisted result dependencies.
Audit actual typed paths and
  kind+id/source.kind+sourceId, recursively bounded depth32; do not compare
  arbitrary title/UUID strings as authority. Include recognized plural ID arrays
and encoded stored JSON request bytes; map notification task_result sourceId,
not every generic resultId (reminder ID). Own content-free operation/fence refs
remain intentionally enumerable; queued conflicting deletions block. Unknown schema/path/relationship
  to selected result fails SOURCE_UNSUPPORTED, not silently clear or ignore.
- knowledge_review_private source_impact sets/items/pages/outbox/projections/
  review_requests are a MIXED connected graph. Close BOTH directions of every
  item_id/receipt_id/delivery_id/projection_id/set_id relation until fixed point,
  CAS complete connected rows; ANY result link blocks KNOWLEDGE_MIXED_COPY.
- core_jobs_v1 and core_artifacts_v1 can contain mixed results without stored
  source IDs. Owner-wide current queued/running/live lease or ANY existing core
  artifact blocks CORE_EXPORT_COPY. Keep original owner34 lock and commit guard
  so an in-flight original export cannot commit a stale mixed copy after erase.
- D3/D4, original ConversationData operations and entity fences: inspect selected
  artifact/exec/journal/publication identity plus source IDs/queued jobs. Block
  OTHER_DELETE_PENDING rather than overlap, re-enroll or alter original flow.

SQL owner must check migrated pg_catalog full columns/types/PK/FKs, including
reverse scalar refs and JSON tables, against this audit. Any new incoming FK or
unregistered dependent fails SOURCE_UNSUPPORTED; no unqualified ON DELETE CASCADE.
Revisions/events complete owner match and revision sequence1..current_revision
with exactly one unique publication key/revision and all event IDs <=PG bigint
are mandatory. Overflow returns explicit SCOPE_TOO_LARGE without fictional partial
eligible graph. Do not leak foreign IDs/body or absence information before actor.

## Closed TS/SQL/Native protocol

POST /api/privacy/native/v1/result-data. Runtime RPC privacy_result_data_v1
(p_action text,p_input_bytes text,p_expected_epoch bigint). Default-denied SQL
RPC; fixture-only explicit authenticated grant is separate from target grants.
Feature DATA_RESULT_DATA_LOCAL=1 is local-only with original config/native auth.

All exact keys/order-sensitive arrays/constants live in contract.ts/protocol.ts;
these files are normative. RootKind artifact ONLY; progress rootKind/rootId null.
Commands contain NO actor/policy/consent/source revision supplied by caller.
C={action:'list',scope,rootKind,cursor:null|{sourceDigest,afterId},limit:20}.
S={scope,requestId,rootKind,rootId,objectIds}. Sensitive objectIds=[]; progress
objectIds sorted1..20 own request IDs, excluding current requestId.
preview={action:'preview',...S}; erase={action:'erase',...S,sourceDigest,
previewDigest,confirmed:true}; recover={action:'recover',...S,mutationBytes}.
mutationBytes is ORIGINAL <=8192 UTF8 erase bytes, whitespace preserved; recovery
wrapper<=16384. No retry/rebuilt bytes/new TTL or reconsent authority substitution.

B={schemaVersion:'result-data/1',...S,ownerId,sessionId,mobileEpoch,sourceDigest,
previewDigest,sourceAuthorities,capturedAt,expiresAt,boundaries,
allUserDataCompleted:false}. expiresAt=capturedAt+30000 exactly. Authorities are
original sorted/dedup policyId+consentId UUID pairs for ALL historical revision
sources, original conversation/message/task/text plus admitted planning sources;
max100, nonempty for result. Requalify original realm(s), not any new consent.

G={artifactIds,executionIds,journalIds,publicationKeys,revisions,eventIds}.
Sensitive artifactIds=[rootId]; revisions exact1..current_revision; publicationKeys
sorted original idempotency UUID per revision; eventIds sorted numeric canonical
positive decimal strings<=9223372036854775807 (NEVER JS number/lexical order).
Execution/journal IDs include ONLY qualified exclusive copies; max1 each from
actual unique task/turn/job. Every admitted completed execution has exactly1
run/proof/completedReceipt/window/origin/output/claim, budgetAttempts>=runs and
planningSources>0 for any execution/journal. Decoder rejects missing copies. Progress G empty.
Total graph<=4100 and total touched source/reverse/witness rows<=4100 /1MB; per
relation10000+sentinel fail closed. Decoder exact counts closed keys:
ERASED_KEYS=artifacts,revisions,resultEvents,executionRuns,callWindows,
collectorOrigins,collectorOutputs,resultClaims,completionProofs,completedReceipts,
localJournals. NO redaction/original sources/whole planning job erase.
RETAINED_KEYS=conversations,goals,messages,tasks,turns,threads,trips,memories,
sourceArtifacts,proposals,budgetAttempts,planningSources.
R={conversationIds,goalIds,messageIds,taskIds,turnIds,threadIds,tripIds,memoryIds,
sourceArtifactIds,proposalIds}; all sorted actual owner UUID sets, count exact
first10 retained keys. Source upstream artifact/proposal is retained; any incoming
or selected proposal/decision dependency blocks PROPOSAL_REFERENCE/
DECISION_REFERENCE. No proposal content/current proposal source is modified.

preview={...B,kind:'preview',graph:G,eraseCounts,retainCounts,
retainedReferences:R,conflicts,eligible,progressCount}. Sensitive progressCount0;
progress count=objectIds.length, empty G/R/zero effect counts.
Conflicts are the ordered CONFLICTS constant, eligible iff empty.
receipt={...B,kind:'receipt',state:'erased',decision:D}.
D={requestDigest,decidedAt,graph:G,erasedCounts,retainedCounts,clearedPreviews,
retainedFences,sourceResult,sourceConversation:'not_modified',sourceTrip:
'not_modified',explicitMemory:'not_modified',externalCopies:'not_erased'}.
Sensitive sourceResult erased, clearedPreviews0; retainedFences=artifact+
publication+execution+journal identity count. Parent artifact fence covers all
revision/event identities. Progress sourceResult not_modified, clearedPreviews
actual<=selectedCount, retainedFences=selectedCount. D finite, NEVER contains B,
preview/receipt/other operation/raw source bytes. decidedAt within original TTL;
valid immutable ACK recovery after TTL still checks original authority/current
actor/session/epoch/sourceDigest/previewDigest and ORIGINAL requestDigest.
unknown={schemaVersion,kind:'unknown',...S,ownerId,sessionId,mobileEpoch,
requestDigest,allUserDataCompleted:false}. Unknown only recovery; lost/malformed
mutation ACK becomes RESULT_ACK_UNKNOWN503. Do not report clean on unknown.

list={schemaVersion,kind:'list',scope,rootKind,ownerId,sessionId,mobileEpoch,
sourceDigest,capturedAt,expiresAt,items,hasMore,nextCursor,allUserDataCompleted:false}.
Sensitive item={rootKind:'artifact',rootId,createdAt,currentRevision,revisionCount,
eventCount,lifecycle:'active'|'withdrawn',resultTypes:sorted unique actual closed
five schema names: change-proposal-reference/1,comparison/1,decision/1,
journey-draft/1,practical/1}. NO copied title/body. All historical revisions/source authority
qualified before metadata. Listing never uses latest/current search-only filter.
Progress item is COMPLETE operation row below. Inventory sorted by UUID, anchored
existing afterId/sourceDigest of entire scoped inventory<=10000+sentinel/1MB,
20/page. No silently omitted hidden/expired/cleaned permanent operations. Both
list and collector use original session/epoch/reauth/authority, fail on changes.
collector.ts collects only one complete bounded snapshot before one absolute
30s deadline; no mutation/retry and partial output is never returned on failure.

## Erasure/CAS/anti-revival and writer compatibility

Source executor reuses original owner34/account/native session guard/recent
reauth<=5min, original policy/consent, private proof and lock patterns. Source
parents in their ACTUAL writer order, advisory result idempotency/identity lock
where applicable; eraser NOWAIT/sorted entity locks fail closed. Do not inject
owner-wide blocking producer locks: prior ConversationData CI demonstrated that
breaks ordinary publication/Trip capacity loser serialization. Preserve ordinary
original lock/order/23505 or REVISION_CONFLICT semantics exactly. Test concurrent
same-id publish and unrelated Trip capacity, not only synthetic privacy lock.

Lock actor/account BEFORE metadata/graph/progress/recovery. Locks for affected
parents+selected artifact+all revisions/events/exclusive copy sources+request
must prove all collected relationships cannot mutate before the erasure proof.
Hash full source rows (including raw content internally), reverse blocker rows,
retained refs/current original authorities and witnesses; no raw graph bodies in
response/log/operation. Preview persists content-free G/counts/refs/conflicts and
original deadline; reuse request cannot renew/change immutable binding.

Erase locks and RECOLLECTS complete graph/copy closure/reverse edges, compares
full sourceDigest/previewDigest and selection, rejects conflicts/absolute TTL,
checks fresh original actor and ALL original authorities after hashing and after
effects. Exact transactional private xid-bound proof authorizes only this owner/
request/source graph. Explicitly delete events/revisions, completed receipts,
collectorOutputs,journals,claims,windows,origins,completionProofs,executionRuns,
then selected artifact only; actual affected counts MUST equal preview. No cascade
out of selected artifact or run; enumerate every allowed child effect. Permanent
fences and D commit atomically with source erase; rollback on any failure.

Permanent guard identities artifact ID, original publication idempotency UUIDs,
execution IDs and journal request IDs are reconstructed from immutable D.graph.
Every guarded insert/update checks identity and BOTH OLD AND NEW referenced
parents: artifact_id/source_result_id/comparisonRef and typed nested source refs,
publication key, execution_id and job.artifact_id via turn/task/scope/attempt/binding
joins. OLD refs remain checked even when callback moves away to a new parent.
Artifact identity fence blocks re-create SAME artifact from retained original
source; source conversation/task/turn are NOT globally fenced (new legitimate
result from preserved source remains possible). Cross-result old/new references
and obsolete callback cannot republish erased identity/copy. Check actual parents
when present plus permanent tombstone if rows absent. Existing immutable revision,
D3/D4/conversation/session/worker/RLS/Trip writers are never relaxed/replaced.
A caller-set GUC is never erase authority. Owner account deletion retains original
cascade; inert retained session UUID has NO session FK cascade. No new hidden
fence table omitted from inventory. Actual backup/device tests remain UNRUN.

## New operation state's own exit

Persist EXACT operation row={requestId,ownerId,sessionId,mobileEpoch,scope,
rootKind,rootId,objectIds,sourceDigest,previewDigest,sourceAuthorities,capturedAt,
expiresAt,requestDigest,state,previewErased,graph,eraseCounts,retainCounts,
retainedReferences,conflicts,decision}. No raw command/source/copy bytes.
State previewed|erased. Sensitive successful erase clears transient graph/counts/
refs/conflicts null and previewErased true; keeps immutable D and authority/
selection/time/hash fences. Progress clears only explicitly selected own transient
previews, including expired/old-session/erased operations, retains ALL original
D/authority/binding/identity fences. Its own operation is finite discoverable and
selectable later. Exclude current request from CAS; no recursive self-enrollment
or receipt nesting. Operation inventory can list old session metadata under current
valid owner session, but terminal ACK still exact original actor/session/epoch.
Progress sourceAuthorities finite sorted union from selected operations, requalified
before effects/return. Capacity10000 before insert; unauthenticated cleanup denied.

## Shared caller/catalog integration candidate (not applied)

RESULT_MODULE in coverage.ts owns only existing results row, export core retained.
Candidate version data-coverage-catalog/2026-10-07.8, same34 denominator. Shared
catalog/contract/registry/outcome/NativeSession/ModuleView/Models/PBX edits only
reviewable patch until prior-owner release+Main precise lease. No existing
artifacts/domain/worker/registry write by this initial task. SQL candidate slot
20261007010000 requires Main FULL wire+unused all-worktree review first; TS does
NOT create SQL migration. Sole new official SQL owner receives this exact wire.
One integrated PR after real PG+signed Auth consumes TS+Native same source;
formal exact-head review/all CI/protected merge stay with Main. Whole239 Open.

Initial TS fixtures and checks are protocol evidence ONLY. No actual PG erasure,
signed Auth, Native screen/file/cache, target/provider/backup acceptance inferred.

## Initial fixed independent TS checkpoint

Actual own product source: contract.ts, protocol.ts, http.ts, coverage.ts,
collector.ts, API route; source inspection ledger SOURCE-AUDIT.json and complete
WIRE. Shared REGISTRATION.patch contains ONLY the existing4 coverage files:
results descriptor/version/import, closed selection, direct HTTP/path/original-
byte recovery and original outcome branch. git apply --check PASS, NOT applied.
All original other33 descriptors/export handlers/Trip consumers unchanged.

Actual own protocol/HTTP/copy-count/fence/recovery/inventory tests8 PASS,0 FAIL,
0 SKIP. Sole emit-native-fixtures.mjs produced10 envelopes+commands under
/tmp/vpj58-result-data-native-fixtures, every envelope/command validated by this
same TS source. Synthetic only; both original whitespace-bearing erase byte
strings and original TTL-past recovery are preserved. Native must consume THIS
producer, no independently invented expected JSON. No-copy fixtures keep all
original sources and complete all-revision/event closure, no fake execution.

Actual pnpm typecheck, pnpm lint, pnpm docs:check and pnpm build PASS. Original
first incomplete TS compile errors corrected in this same implementation; not
runtime PG failure or environment issue. Native/result-data route is built.
Supabase pinned dependency and official current RPC docs checked; no dependency,
config, credentials, schema or grant change. pg_catalog/SQL erase+locks+fences,
signed actual Auth+coverage caller, Native device/file/cache and target/external
acceptance UNRUN. Initial TS source completion is not scopeComplete/whole239.
Main one-batch fixed-wire audit and unused-slot check precede sole official SQL;
final integrated TS/SQL/Native/real signedAuth/registered caller/one PR remains
required. No new child chats or shared source writer were created by this owner.

Main has approved fixed725827b0 whole WIRE and verified all-worktree unused
20261007010000 slot. Official unique SQL owner01a115bb-2e1d-7382-a0f7-21ff76b197f0
owns vpj58-result-data-sql-20261007 / append20261007010000_result_data.sql and own
PG contracts. Initial product wire/fixtures remain byte-identical725827b0.

Prepared own signed Auth consumer auth-http.test.mjs and isolated run-http.mjs,
using the original disposable GoTrue/native login pattern, real original owner
source submitters and service publisher with synthetic completed source output.
One test covers two historical revisions+withdrawal/all3 events, sibling same
source preserved, whole Conversation/Task/Turn/Trip/Memory/financial rows retained,
registered coverage erase/exact-byte receipt/recovery, unknown uncommitted
preview and explicit progress cleanup/complete operation inventory, wrong epoch/
foreign/unauthenticated/revoked-original-consent/reauth/default-denied RPC.
Synthetic financial rows are fixture data, never a provider/billing claim.
Runner fails before creating resources unless actual fixed SQL and precisely
leased result_data registration exist. No target .env discovery or remote grant;
only isolated unique local namespace, port collision guard, fixture grant/revoke,
owned stop/no-backup cleanup. Node syntax checks for both files PASS; real signed
Auth run UNRUN until those actual dependencies integrate. No zero-skip/pass claim
from a gated test and no unchanged protocol/build/Native matrix rerun.
Shared original4 registration hunks remain patch-only, no shared lease consumed.

## Actual fifth stored schema correction

SQL source audit found the initial list decoder had a wrong fifth literal.
Original valid_result_content_v2 at03110000:51 and valid_proposal_reference_v1
at02110000:15 both persist change-proposal-reference/1. Sole RESULT_TYPES now
uses exactly that original name; old invented change-proposal/1 is rejected.
No sixth type, store/publisher/proposal writer or deletion boundary changes.
Own existing list test accepts actual proposal-reference metadata and rejects
the old name; proposal-list fixture is added, original10 envelopes/commands
unchanged. Selecting a proposal reference remains PROPOSAL_REFERENCE blocked.
This supersedes only the initial list type literal; other4 types and full wire
keys/counts/authority/TTL/operation/receipt/fence semantics remain unchanged.
Affected actual list test1 PASS,0 FAIL/SKIP; typecheck/lint/diff PASS. Sole producer
now11 envelopes+commands. Original10 envelopes+commands independently regenerated
with prior67c5682a emitter and compared:11/11 byte-hash MATCH; only proposal-list
added. No unaffected full suite/build/Native/Auth run repeated for this literal.

## Precise TS caller registration lease consumed

Main523d89 granted original C sole-TS explicit clean/no in-flight/planned/successor
release. Applied exactly original4 REGISTRATION.patch hunks in coverage catalog,
contract, registry, outcomes, plus the named TS notification native-catalog-v4
fixture's .8/results single descriptor. Retired applied own patch. Same34,
other33 in original order/value, original core export and ConversationData remain.
No execution helper/SQL/CI registry/permission or unrelated shared file written.
TS and fixedNative f5f8c6 catalog modules+outer metadata compare EXACT .8/same34.

Own registered caller test observes actual fixed path/delegate, preview, erase,
original whitespace bytes, lost ACK/recovery unknown, old.7 rejection with no
handler call, original results core export. Actual affected batch34 PASS,0 FAIL/
SKIP = own9 + original ConversationData9 + coverage dispatch12 + notification
coverage4. Typecheck/lint/docs/diff PASS. This is HTTP/TS fixture evidence, NOT
signed Auth/Postgres erase, provider or device acceptance. Existing unchanged
Native/source tests and initial build evidence reused, not rerun for bookkeeping.

Sole integrator normally merged exact fixedNative964b then f5f8c6; complete ios
source equals f5f8c6, all11 envelopes+commands12/12 byte-hash MATCH. Latest TS
fifth-type wire is d0591196. SQL fixed source/real PG consumer/signed Auth remains
outstanding; no original partial dirty migration/source copied. Whole239 Open.

CI-REGISTRATION.patch is a concrete pending lease object, NOT applied. It adds
only actual result-data-sql/postgres.test.mjs to the existing postgres file list
(VP_PRIVACY_DB_TEST already supplied), and APPENDS the actual signed Auth runner
at native-HTTP step index31/base63080. Original31 native steps keep identical
indexes/parity/commands/env; logical lanes/two-shard helper/workflow/timeout/
strict summary/zeroSkip/aggregate/EXCLUDED unchanged. No new env switch required.
Apply-check PASS; shared classifier/governance execution awaits precise Main
original-registry-owner release/lease and fixed SQL file integration. No nonexistent
SQL source copied or fake registered-path success. Own Auth runner requires real
fixed migration plus actual registered result_data caller before resource start.

## Actual signed Auth chain closed after compatibility repair

Actual repaired SQL06a2c4b9 normally integrated85bee5e4; migration hash matches
schema-compatibility-checkpoint, entire SQL tree equals fixed source. No dirty
owner output copied. Original251 application schema private1/fullhash and all
reverse/boundary drift checks retained; only six real managed namespaces isolated
with typed crossing negatives and final recheck. Original705 PG proof remains
scoped/reused; first actual Auth r1/r2 FAIL+cleanup PASS retained in finding.

Auth r3 ACTUAL1 PASS/0skip on combined85bee5e4, cleanup5e524606 PASS: real
GoTrue/JWT/native session -> ordinary owner RPC -> TS actual SQL decoder ->
registered results coverage caller -> complete selected withdrawn artifact erase
(all2 revisions/all3 events) -> original whitespace bytes immutable receipt/
read-only recovery -> own finite inventory/explicit transient cleanup. Full
original Conversation/Task/Turn/Trip/applied proposal/history/explicit Memory/
financial rows and unselected same-source sibling unchanged. Original publish
cannot restore erased artifact; wrong epoch/foreign/no credentials/changed bytes/
original revoked consent/reauth/default-denied/grant-revoke negatives observed.
Provider output/financial rows are controlled synthetic fixture data; real signed
Auth is observed, not a real provider/fee/target/device/backup completion claim.

Owned runtime source/caller/Native/SQL/actualAuth core is implemented. Whole239
and remaining ALL1/ALL2 remain Open. Main whole-chain batch review, precise pending
CI registration lease, one integrated PR/exact-head formal/all required CI and
protected merge remain required. No target grant/config/provider/production action.
Existing valid scoped evidence reused; no new process, child chat or extra matrix.

Final SQL owner92e338e1 replaces intermediate06a2c4b9 only in committed
ownproof/smoke.json fresh ordinary-source output (IDs/times/digests/event sequence).
Runtime migration, compatibility proof/runner and all assertions are BYTE IDENTICAL.
Applied only that exact committed delta, never dirty files; whole SQL/proof tree
now equals final92e338e1. Auth r3 runtime hash906b7be7/config/caller unchanged,
so actual1PASS/cleanup5e524606 evidence remains effective; no duplicate source
cherry-pick or unnecessary unchanged Auth rerun.

Profile Native precise release (read-only, separate task): current Result source
f5f8c6 is stable, no Swift source in-flight/planned/successor writes. Explicitly
release only Profile additions to NativeSession factory/request/receipt floor/
displayName generation/cache cleanup, NativeDataCoverageModuleView destination/
profile entry, PBX own Profile references/memberships, and NativeVPTravelPaceView
Profile observer; original Result cases/cleanup/tickets/.8/pending bytes preserved.
Future NativeDataCoverageModels .8→.9 constant only/same34 is also released for
Main-reviewed Profile integration, not an application to this Result checkout.
Read-only patch applies to current f5 context;28 new PBX IDs unique/noncolliding.
First broad object-ID check falsely treated existing Resources replacement as a
new collision; corrected additive identity check passes. This release does NOT
cover ProfileView/NativeTravelPace/VPStore/TravelerBrief hunks owned by others,
whole files, current Result branch writes, TS/SQL/CI or unrelated architecture.
Main grants actual Profile task application after its other applicable releases.
