# VPJ-58 independent conversation data — complete wire v1

Fixed base `a1f70134fb6abf3672a94b956a4296b36c2c3d59`, independent WT/branch
`vpj58-conversation-data-server-20261006`. Sole TS: this directory, own new API,
contracts and integration. No runtime SQL here. Candidate slot `20261006060000`
has no file in any available `VP-V5-worktrees/*/supabase/migrations` at audit.
Main reviews this whole wire/source/lock boundary BEFORE assigning a NEW SQL
owner. Shared conversation/Trip/worker/coverage/Session/PBX require exact lease.
No target GRANT/role/key/real user deletion/provider/Storage/deploy/device authority.

## Why the old entry cannot deliver this result

`20261003190000_vpj36_linked_trip_delete_d3.sql:40` takes mandatory `p_trip`;
its graph starts from that Trip's links/threads/turns/results, not a conversation.
`:164` locks an owned Trip; `:173` preview/confirm takes tripId/head version;
confirm queues `privacy_private.trip_deletions`, and the worker completes the
selected Trip deletion. The TS `linked-trip/contract.ts` accepts only Trip preview
and Trip confirmation. Catalog `conversations/results/turn/user_artifact` remains
core-export-only. No existing independent conversation/thread erasure route found.
Reusing that route would violate this accepted result's preserved Trip boundary.

Reuse D3's bounded graph/owner34 lock/NOWAIT/fence/immutable receipt patterns,
D4's source CAS and explicit retention, original text permanent hiding, original
Native owner/session/epoch guards and request lifetime. This is one atomic bounded
new source executor, no new generic privacy engine or hosted deletion worker.
No automatic cancellation of active provider work. Existing original D3/D4 untouched.

## Actual source graph and exact boundary

IDs are sourced from real tables, never UI/current Trip guesses. One explicit
root: owned `turn_private.assistant_conversations.id` OR `public.chat_threads.id`.
List returns owner/current-consent eligible roots, no raw title/input/output.

Conversation root: select ONLY its owner goals/messages; collect tasks/turns
actually referenced by those messages/results/planning rows; collect task thread,
all its service_task_turns and root/last text turns. Every entire selected thread
and task must belong exclusively to this conversation. Foreign-owner rows,
messages in another conversation sharing ANY selected task/turn/goal/thread,
or parents/children outside selection -> SHARED_OR_FOREIGN_SCOPE or
CROSS_SCOPE_REFERENCE. Never silently expand to another conversation.

Thread root: owned standalone thread, all owned turns/text/tasks. If ANY
assistant message/goal/conversation relates to it, reject cross scope and let
the user explicitly select that conversation instead. Do not silently delete it.
Core selection exact sorted arrays `GRAPH_KEYS` in contract.ts. Closure runs to a
fixed point with sentinel/limit, not D3's two-pass assumption. Result artifacts
start from selected input_message/goal/task/source_turn. Reverse source_result
closure is allowed ONLY within selected conversation; external artifact or revision
referencing selected artifact/turn (including content.comparisonRef.artifactId,
content.sourceTurnId and source taskTurnId) -> CROSS_SCOPE_REFERENCE. Inspect
assistant_message_source_receipts.input_sources/captured_sources artifact refs
in unselected messages too. Never FK-cascade an unselected result.

Actual delete mapping (all rows must have qualified owner, ALL parent identities
inside core selection, exact PK order/hash in internal graph; no unknown columns
silently ignored). All available versions/rows included, not current-only:

| Counts key | Actual source and join |
|---|---|
| conversations/goals/messages | assistant_conversations.id; assistant_goals.conversation_id; assistant_messages.conversation_id/parent_message_id/task_id/turn_id |
| threads/turns/events/idempotency/feedback | public.chat_threads.id; public.turns.thread_id; public.chat_turn_events,chat_turn_idempotency,turn_feedback via thread/turn |
| artifacts/revisions/resultEvents | turn_private.result_artifacts (goal,input_message,task,source_result,source_turn); result_revisions.artifact_id/task_turn_id; result_events.artifact_id |
| sourceReceipts/intakes/intakeBindings | assistant_message_source_receipts.message_id; assistant_travel_intakes.message_id/conversation_id/goal_id; planning_intake_bindings source_message_id/message_id/turn_id |
| planning/actionReceipts/observations/modelDispatches | planning_comparisons turn/task/message/goal; planning_action_receipts turn/task/message; planning_observations turn/action; planning_model_dispatches turn/task |
| checkpoints/attemptBindings/localJournals | planning_v2_place_checkpoints, planning_v2_model_attempt_bindings, planning_v2_model_local_journal turn/task |
| executionRuns/callWindows | planning_v2_execution_runs turn/task; planning_v2_external_call_windows.execution_id |
| collectorOrigins/collectorOutputs/resultClaims | planning_v2_collector_origins.execution_id; planning_v2_collector_outputs.execution_id; planning_v2_result_claims.execution_id |
| completionProofs/completedReceipts | planning_v2_completion_proofs.turn_id; planning_v2_completed_receipts.turn_id |
| grounded/assistJobs/work | grounded_turns.turn_id/task_id; grounded_ai_assist_jobs.turn_id; turn_private.work.turn_id |
| memoryConsumers/goalLinks | public.memory_consumer_receipts.turn_id ONLY (never proposal consumer); assistant_goal_trip_links goal/conversation |

Source definitions: 20260828153000/160000/194000; 20260910163426/171836,
20260911200339/12190000/15200000/26132008/27021000/030000/040000/050000/060000;
20261002200000; 20261003020000/040000/050000/060000/090000/150000.
These suffixes refer to existing migration filenames, not new SQL slots.
No independent user_artifact source table was found: results are result_artifacts,
not proof of a new generic attachment store. Original core user_artifact export
missing/denominator remains unchanged. This module does not fill five module rows.

Closure includes ALL private text_content for selected thread/task root/last turns,
not just currently visible public Turns. If a retained text row has no matching
selected public Turn, or a selected task root/last/reference lies outside the
closed graph, return SOURCE_UNSUPPORTED instead of ignoring its retained body.
Terminal old text without a live selectable root stays under the existing core
retained-source boundary; this task does not invent an orphan-data account sweep.

Redact exact selected turn_private.text_content input to fixed
`[deleted by scoped conversation request]`, output_kind/output_text=null,
hidden_at permanently set. Original NOT NULL/retained FKs require this, not DELETE.
Selected service_tasks.goal_digest -> SHA256 of same fixed marker, not user text.
Retain finite tasks/taskTurns/capacity/budgetAttempts/textDispatches/goalTripReceipts
counts, from service_tasks/service_task_turns/service_task_capacity,
public.model_budget_attempts, text_dispatches, assistant_goal_trip_receipts.
Capacity/Store grant/transaction/budget/settlement fields and financial ledger are
never fabricated/deleted. Task identity/scope/policy/consent/root/last/idempotency
metadata remains with permanently hidden text and permanent identity fences.
Original link receipts have no conversation FK and remain minimal historical
reference/operation proof. Show this retention; do not claim complete row removal.

Preserve original explicit Memory, receipts, consents and Trip content, archives,
version snapshots/events/proposals/idempotency/financial/Store records. Existing
Memory schema stores independent summary/receipt, no source Turn FK to erase.
Selected turn consumer references may be deleted; Memory identity remains.
Preview retainedReferences={tripIds,memoryIds} contains ONLY qualified owner IDs
from selected goal links/link receipts/result Trip refs/turn.thread Trip refs and
selected consumer/result memory_basis refs, never foreign IDs/text. Trip refs
do not seed other chats or whole-Trip erase. Queued original deletion -> blocker.

Explicit blockers (closed `CONFLICTS` order) before any effects:
- ACTIVE_WORK: nonterminal selected Turn; queued/leased work even lease expired;
  grounded_ai_assist_jobs queued/running; planning not terminal; external call
  window.calls>0 without original completion proof, collector attempted_at with
  no response_buffered_at, unknown_at set; local journal without settled completion;
  budget reserved/dispatched/pending; capacity reserved. No provider cancel/refund.
- PROPOSAL_REFERENCE: selected result_artifacts.proposal_id or result content
  proposal_preview/change-proposal reference, and original Turn proposal payload
  references. Applied AND unapplied proposals use original accepted flow; do not
  delete confirmation/history or first erase source and repair after.
- READINESS_REFERENCE: readiness_private.scopes_v1 any conversation/goal/message/
  thread/root_turn/task_turn/task match (20261004000000) and its operations.
- GUIDE_REFERENCE: guide_private.bindings_v1 selected turn/task/thread/parent_turn
  (20261005080000); preserve uses/progress/rights domain rather than FK cascade.
- SCOPED_EDIT_REFERENCE: scoped_edit_private.work_v1 turn/task/source JSON and
  requests_v1/binding related selected identities (20261005020000).
- NOTIFICATION_REFERENCE: notification_private.reminders.source or watches.source
  selected task/artifact; dismissals.source_id of selected result/task. Original
  outbox/watch/attempt domain retained; do not cancel real APNs/provider work.
- BRIEF_REFERENCE: service_brief_private.briefs.sources or previews.sources
  intakeMessageId of selected assistant_travel_intakes/message (20261005060000).
  Check retained operations.request_bytes and receipt references too. Brief's
  selected intake field reader is a real separate source; preserve recipient/grant
  domain and refuse until original Brief flow handles it, including stale previews.
- Reservation `valid_source_v1` defines artifact_reference, BUT actual records
  constrain source.kind=user_reported and the RPC explicitly rejects artifact_reference
  (20261004020000:79,138). It is NOT an actual result dependency or supported
  new module. Preserve the independent order flow; do not count its unused
  validator shape as an existing source. Unexpected unsupported stored relation
  still fails SOURCE_UNSUPPORTED, never invented reservation cascade/cleanup.
- CORE_EXPORT_COPY: ANY owner core_artifacts_v1 row (including expired ciphertext)
  or queued/running core_jobs_v1/active unexpired lease. Encrypted mixed-scope
  artifacts have no exact source graph: refuse until original cleanup; never
  invalidate all owner exports as a guessed conversation relationship.
- OTHER_DELETE_PENDING: selected old D3/D4 entity/reference fence or queued Trip
  deletion affecting referenced Trip; original owner controls original flow.
- SOURCE_UNSUPPORTED: unresolved JSON reference, unknown FK/reverse edge/table
  registry drift or unreadable source; no fabricated empty relation.
  SQL owner finding `b5a1df00` confirms source-impact historical_answer references
  in knowledge_review_private.source_impact_sets.graph_snapshot[].target,
  source_impact_items.target and source_impact_projections.target, with derived
  pages/outbox/review requests. ANY such selected-Turn relation is blocked before
  redaction, included in source CAS; original text-hide cleanup can otherwise
  invalidate a whole mixed set and stale unselected deliveries while taking
  blocking locks. Preserve that domain, never implicitly invoke its cleanup or
  claim outside NOWAIT covers it. Permanent known-target guards must reject later
  old/fenced historical_answer references, including root sets/items/projections
  and copied receipts. Existing SOURCE_UNSUPPORTED enum/boundaries cover this;
  no new wire field, handler, module denominator or scope. Actual original-trigger
  reproduction/rollback3 PASS is separate SQL-source-audit evidence, not this
  module's executor or Auth evidence. See SQL owner's SOURCE-AUDIT.md.

Internal graph hashes whole actual row JSON (all fields) and PK, selected and
reverse-edge/blocked relation inventories, live policy/consent state and retained
Trip/Memory versions/statuses. No bodies in stored preview/return/fence/receipt.
4100 selected+derived rows maximum, per-table10000 sentinel and whole wrapper1MB.
Overflow -> SCOPE_TOO_LARGE with qualified root only or empty graph; no truncation
pretending executable. Authorized blocker feedback never includes foreign IDs.

## Transport/closed commands and payloads (sole TS contract)

POST `/api/privacy/native/v1/conversation-data`, JSON bearer ordinary Native owner;
reject cookie/origin/query/other method. `{data:payload}` or `{error:{code}}`;
private,no-store/Vary Authorization/nosniff. RPC
`privacy_conversation_data_v1(p_action text,p_input_bytes text,p_expected_epoch bigint)`.
ORIGINAL raw bytes, no service role/new credential. DATA_CONVERSATION_DATA_LOCAL=1
and config.environment absent AND VERCEL_ENV absent. Default disabled/ungranted.

Scopes and selection S exact={scope,requestId,rootKind,rootId,objectIds}:
- conversation-sensitive-data/1: rootKind conversation|thread; lower-case UUID
  rootId from actual list; objectIds=[]. One selected root only.
- conversation-delete-progress/1: rootKind/rootId=null;1..20 strictly sorted
  lower-case operation UUID objectIds, excluding new requestId.

Commands exact (no additional fields):
- list={action:"list",scope,rootKind,cursor:null|{sourceDigest,afterId},limit:20}.
- preview={action:"preview",...S}.
- erase={action:"erase",...S,sourceDigest,previewDigest,confirmed:true}.
- recover={action:"recover",...S,mutationBytes:<ORIGINAL erase bytes>}.
Only original selection/requestId/source/preview/confirmation bytes; no automatic
erase replay, new op, parsed/reserialized bytes or converted export. UTF8 command
8192; recover outer16384. Recover is read-only, never starts an erase.

Binding B exact={schemaVersion:"conversation-data/1",...S,ownerId,sessionId,
mobileEpoch,sourceDigest,previewDigest,capturedAt,expiresAt,boundaries,
allUserDataCompleted:false}. Digests lower64hex; time epoch ms; expiresAt exactly
capturedAt+30000, original fixed clock never renewed on retry.
boundaries EXACT CONVERSATION_BOUNDARIES from contract.ts on ALL preview/receipts;
Native renders eraseFields/redactFields/retained/missing before confirm.

Preview exact={...B,kind:"preview",graph,eraseCounts,redactCounts,retainCounts,
retainedReferences:{tripIds,memoryIds},conflicts,eligible,progressCount}.
graph exact GRAPH_KEYS sorted unique UUID arrays. Exact count keys are
ERASED_KEYS/REDACTED_KEYS/RETAINED_KEYS, natural0..10000. Eligible iff conflicts=[];
eligible core counts equal graph lengths; counts all actual derived rows.
Sensitive scope progressCount0. Progress scope empty graph/all source counts0,
progressCount=objectIds.length; retainedReferences empty. Never body in preview.

Receipt exact={...B,kind:"receipt",state:"erased",decision:D}.
D exact={requestDigest,decidedAt,graph,erasedCounts,redactedCounts,retainedCounts,
clearedPreviews,retainedFences,sourceConversation,sourceTrip,explicitMemory,externalCopies}.
Immutable requestDigest=SHA256 original mutation bytes; capturedAt<=decidedAt<
expiresAt; decidedAt<=now. Actual count effects equal the originally planned
counts or rollback, graph original fence selection; NOT recomputed on recovery.
Sensitive scope: sourceConversation="erased", clearedPreviews0, retainedFences=
sum core graph array lengths. Progress: sourceConversation="not_modified",
empty graph/all source counts0, retainedFences=selected count, clearedPreviews
actual0..selected count. Always sourceTrip/explicitMemory="not_modified",
externalCopies="not_erased", allUserDataCompleted=false. No queued/completed
claim without commit; no all-account completion badge.

Unknown exact={schemaVersion,kind:"unknown",...S,ownerId,sessionId,mobileEpoch,
requestDigest,allUserDataCompleted:false}. Never erased. Returned only on exact
recover with no committed decision. Same bytes remain pending. A committed
decision may recover after original TTL ONLY under original current actor/
session/epoch+reauth; original digests/time/decision, not current-source replacement.

List exact={schemaVersion,kind:"list",scope,rootKind,ownerId,sessionId,mobileEpoch,
sourceDigest,capturedAt,expiresAt,items,hasMore,nextCursor,allUserDataCompleted:false}.
Sensitive items={rootKind,rootId,createdAt}, no body/currentTrip heuristic.
Progress items are COMPLETE finite operation rows below (not receipt nesting).
Owner inventory10000+sentinel/whole1MB, sourceDigest of all scoped rows, UUID order,
20/page, anchored existing afterId with same digest, no skipped/truncated inventory.

## Locks, source CAS, erasure and permanent anti-revival

Reuse owner advisory hash(owner,34); original live auth.users/auth.sessions/mobile
account guard + epoch + reauth<=5min BEFORE source feedback, list, recovery or
cleanup. Lock account before graph; selected service-task identities advisory in
UUID order (original submit_service_task_turn), selected tasks, owned referenced
Trips NOWAIT, selected conversation then thread/Turn/goal/message/artifact rows
UUID order NOWAIT. Source policy/consent/Memory and derived rows sorted NOWAIT;
request row last. All later locks NOWAIT so opposite original writer order fails
closed, not hangs. Fresh original mobile session and live text/planning policy/
consent qualify every selected source before returning its metadata.

Preview stores sourceDigest+content-free graph/relations/counts and fixed deadline.
Erase obtains same locks, rebuilds entire source graph/blocked reverse edges,
checks exact original graph/digests/no conflicts/absolute clock and actual counts;
stores transaction-bound erasure proof (private, no caller-set GUC authority),
permanent identity fences and minimal immutable decision in ONE transaction.
Delete derived leaves and explicitly selected parent edges, never rely on
unqualified cascade; delete message leaves and reject cycles. Keep task/text
retained FKs. Fresh owner/session/epoch/consent/clock AFTER last hash and AFTER
effects and before return; failure rolls back every body/fence/receipt effect.

New permanent fences use original D3 pattern but separate scope/erase proof;
do NOT invoke D3 erase_authority requiring queued Trip/service worker. Cover
core identities including conversation (missing in old D3), every mapped source
and old/new parent edges, source_result,source_turn,source_message,parent_turn,
input_message,goal_turn,last_turn,execution_id joins and known nested JSON refs.
Before-insert/update guards lock existing source parents where present and check
permanent identity fences even if source rows were deleted/recreated; BEFORE
UPDATE checks BOTH old and new parents. Old callback/producer request cannot
move away from fenced parent or create new artifact/message from erased source.
Only this RPC's exact current transaction/source proof allows its own erase/
redaction. Original immutable-source-receipt update guard remains (delete only).
Never relax original D3/D4/session/worker/security guards or raw content visibility.
Old work completion/read functions require selected rows/current leases; deleted
work and permanently hidden text cannot accept late completion. Add mapped-table
identity guards rather than rewriting shared worker TS. Core export in-flight/
copy blocker plus owner lock prevents a previously authorized mixed copy from
committing after deletion; never enroll/reset old jobs into a new export scope.
Restore cannot reinsert fenced root/entity or publish its old references; testing
this on owned local disposable fixture is separate from real backup/device ALL2.

## New state's own exit: complete minimal inventory, no recursive omissions

Private operation row EXACT persisted fields=validOperationRow protocol keys:
requestId,ownerId,sessionId,mobileEpoch,scope,rootKind,rootId,objectIds,sourceDigest,
previewDigest,capturedAt,expiresAt,requestDigest,state,previewErased,graph,
eraseCounts,redactCounts,retainCounts,retainedReferences,conflicts,decision.
No raw bytes, source bodies/file/page payload. State previewed|erased. Decision
is finite D, never full B/another operation/another receipt. RLS/private API table
default denied. Owner FK original account deletion semantics; original sessionId
is inert retained UUID, not cascading session FK (permanent anti-revival must
survive session deletion). Current operation access still exact live session/
epoch; owner inventory can discover old session metadata under new live authority.

Erased sensitive operations clear transient graph/counts/refs/conflicts to null,
previewErased=true, retain immutable D and source/root/selection/time/hash fences.
Progress erase clears selected transient previews (including expired/erased ops),
sets previewErased=true, retains original D and all binding/selection/hash/time
fences; stores its own finite D. No deleting tombstones/op identity. Its own
operation is discovered by the same progress list and can be selected later.
Progress CAS excludes its current requestId; no recursive self-enrollment.
Selected tombstone inventory reconstructed from D.graph and op requestId; no
second hidden fence inventory. Capacity10000 before insert; no cleanup bypass on
unauthenticated list. Reuse expired/replaced operation key cannot renew or mutate.

## Shared registration requested, not yet applied

No new generic account/module row. Under precise Main/prior-owner lease add ONE
`conversation_data` handler to original conversations module while preserving
existing core export. Keep results/turn/user_artifact core export/delete missing
entries; this scoped graph covers exclusive referenced results/Turns only.
Use exact module selection command, operationId=requestId; tripId must null,
validate original actor/session/epoch and original bytes/source/preview on outcome.
Root metadata progress uses same module/executor, not a second engine/denominator.
Native own ConversationData consumer uses sole wire. Native/coverage/Session/PBX
shared registration ONLY after lease; untouched in this initial package.
Candidate catalog version is `.7` after existing archive `.6`, same34 modules:
only conversations descriptor changes, exportHandler remains original core.
TS shared hunks: coverage/catalog import+single descriptor/version,
coverage/contract one closed handler branch, coverage/registry direct call/fixed
path/recover body, coverage/outcomes one original classifier branch. No old Trip/
linkedTrip/Memory/export worker rewrite. Ungated own TS contract test is already
auto-classified test:integration by original registry; SQL/Auth lane additions
wait for actual NEW SQL/Auth files and precise Main CI lease, not fictitious paths.
`REGISTRATION.patch` contains exactly those FOUR TS shared-file hunks against the
fixed base. `git apply --check` PASS; not applied. It preserves all existing
handler branches/core export/Trip consumers and denominator34. This patch is the
concrete lease-review object; no second source writer or new supervising matrix.

Error allowlist is `errors` in http.ts; authority401, policy/forbidden403, input400,
others503. Once mutation dispatched any lost/malformed/mismatched ACK ->
CONVERSATION_ACK_UNKNOWN503, preserve same bytes. HTTP no retry, no secret logs.
No runtime source/PGAuth claim from TypeScript fixtures. Source executor/new SQL,
mapped permanent guards/shared registration and actual fixture contracts must
join before scopeComplete; whole239/fullmissing/ALL2 remains Open.

## Initial fixed TS delivery and pending owner action

Own contract/decoder/HTTP/API/coverage adapter written on the fixed base. Actual
`node --experimental-strip-types --test tests/integration/privacy/conversation-data/contract.test.mjs`:
7 PASS,0 FAIL/skip. `pnpm typecheck`, `pnpm lint`, `pnpm docs:check`, diff check PASS.
These are TS protocol/authority/byte-recovery negatives, NOT actual PostgreSQL
graph erasure, Auth HTTP, Native file/cache, provider or old-device evidence.
No shared source files edited. No runtime SQL/target action performed.
Main0e681e approved this whole source wire after unused060000 audit; NEW official
SQL owner `01a10e96-c9b2-7fc2-9eb2-d95b8145fcb9` is assigned sole060000/own PG
contracts. Creation is not executed SQL/source proof. Shared prior-owner release/
lease for the listed hunks remains pending. Scope remains in development until
actual source/execution/fence/receipt and registration join.

Sole producer `tests/integration/privacy/conversation-data/emit-native-fixtures.mjs`
actually ran and wrote `/tmp/vpj58-conversation-data-native-fixtures`: 9 envelopes
plus commands.json, all self-checked against this TS parser/decoder. Synthetic
only, no PG/Auth/provider/device claim. Receipt recovery clock deliberately passes
original TTL; original eraseBytes/progressEraseBytes include intentional whitespace.
Native must consume THESE envelopes and original bytes. Final conflict order and
boundary arrays include actual BRIEF_REFERENCE; reservation artifact_reference
remains unused/rejected, not a real dependency. Final eligible graph/decision
capacity includes sum erased+retained+textBodies<=4100, not just core ID arrays.
Original contracts/protocol/HTTP unchanged since fixed `44c1d705`; this fixture
producer adds no new payload fields or SQL phase. TS contract7 PASS/zeroSkip reused.
