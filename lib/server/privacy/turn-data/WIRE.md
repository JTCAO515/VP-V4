# VPJ-58 Turn data — sole contract v1

Base `ff1de3a65b0b85c271ab29448a1b89ff43cfc09e`, exclusive WT/branch
`vpj58-turn-data-server-20261007`. Profile/Export dependencies are unmerged.
TS owns this directory, `tests/integration/privacy/turn-data/` and Main-authorized
new adjacent API `app/api/privacy/native/v1/turn-data/route.ts`. Shared
worker/catalog/registry/route/CI edits remain candidate patches until Main's
exact lease. No SQL here. Candidate `20261007050000` absent from available
VP-V5 worktrees at 2026-10-07 23:58 CST; Main must recheck before assigning SQL.
Main reviewed full 2b60e4fd wire/35-source schema and assigned sole SQL
01a11715-53b5-7cf0-8c42-cc87905a82a2 at 2026-10-08. Subsequent TS refinements
use this same source boundary; runtime SQL/Auth/D2/Native completion and whole
#239 closure remain unproved.

## Existing mechanism and one user result

D2 `export-dispatcher.ts` has `turn` in its unchanged nine-module denominator.
`export-worker.ts` registers conversations/results/trip/memory/entitlements/profile,
but no Turn producer. Coverage `core('turn')` has no delete handler.
ConversationData root execution expands an entire conversation/thread. It cannot
retain a parent and select one Turn. Reuse original D2 job/lease/canonical bundle,
encryption/private download/recovery and generic Native export UI. Reuse the
original owner session/epoch/current policy/consent/reauth and 30s request lifetime.
No new planner, provider request, budget authority, global sweep or privacy engine.

User chooses an actual completed Turn from owner inventory, exports actual owned
Turn sources through D2, reads full preview/counts/retention/blockers, explicitly
erases that Turn's sensitive copies with source/preview CAS, recovers the same
immutable decision using ORIGINAL request bytes, and may explicitly clean bounded
own preview progress. Preserve all other Turns and parent task/thread/conversation,
confirmed Trip, explicit Memory and financial state. Shared/mixed data is blocked.

## Exact source graph

`source-schema.json` pins 35 actual table shapes, PKs and effect classification,
from `20261006060000` sources/schema and original migrations. It is an actual
column/type/nullability allowlist, not permission to query every owner table.
The same approved shape must be checked against actual SQL catalog before reads.
Unknown columns/FKs/reverse relations/JSON references => SOURCE_UNSUPPORTED;
never strip a new column or interpret unreadable/unregistered tables as empty.
Owner sources include legacy current-input/task-history, grounded, planning v1,
qualified planning v2 and selected-source/intake versions. No invented user_artifact.

Root is EXACTLY one `public.turns.id`, qualified owner + `text_content.turn_id`.
Only status `completed`, original text policy/consent and non-active worker graph
may be selected. Public Turn without text, retained text without a public Turn,
or null/unqualified thread is visible to export/source diagnostics but cannot be
fabricated as an eligible selected root. A fenced erased Turn is explicit `erased`
in inventory and remains identity-only. No active-work cancellation.

Graph exact={turnIds,messageIds,artifactIds}: turnIds=[selected Turn]; messageIds
are assistant_messages whose actual turn_id equals root, plus planning_comparisons
exact message_id for root (original 20260927060000:176-196 submits follow_up with
turn_id=NULL), and exclusive result input_message_id bound by actual revision
task_turn_id=root. Require exact owner/task/goal/conversation/sequence basis. NULL
message.turn_id with this real binding is valid; only absent/ambiguous producer
binding is unsupported. Never guess from shared task/latest/goal or equal text.
Artifacts seed ONLY revisions.task_turn_id=root OR artifacts.source_turn_id=root,
with actual input-message binding. Include ALL revisions/events of each artifact.
Every revision must belong to root and its exact message/task/goal, every source
artifact edge must be contained within selected exclusive artifact set. Any old
revision from another Turn, reverse artifact/message-source/JSON reference outside
the set, or mixed current result => CROSS_TURN_REFERENCE. No delete-one-revision
facade and no cascade to an unselected artifact.

RetainedReferences exact={taskIds,threadIds,conversationIds,goalIds,tripIds,memoryIds},
sorted qualified owner IDs. These are retained parents, NOT graph closure seeds or
tombstone targets. Parent content/versions are never modified. Task goal_digest is
the sole conditional exception: when service_tasks.goal_turn_id=root it is a copy
of selected input and is replaced by fixed marker hash; count as taskDigests, show
this before confirmation. If another Turn depends on that root context, block.

| Effect/count | Actual source join, no parent expansion |
|---|---|
| retain turns | public.turns.id=root, same row including status/Trip/thread |
| redact textBodies | text_content.turn_id=root: input fixed `[deleted by scoped turn request]`, output_kind/output_text=NULL, hidden_at permanent |
| redact messageBodies/retain messages | qualified assistant_messages by exact root/planning/result binding above, input_text same fixed marker; exact all other columns retained |
| redact taskDigests/retain tasks | service_task_turns.turn_id=root -> service_tasks.id; only root goal_digest marker; all other fields retained |
| erase events/idempotency/feedback | public.chat_turn_events/chat_turn_idempotency/turn_feedback.turn_id=root; never whole thread |
| erase artifacts/revisions/resultEvents | exclusive graph above; result_artifacts/result_revisions/result_events |
| erase sourceReceipts/intakes | assistant_message_source_receipts.message_id / assistant_travel_intakes.message_id in selected messageIds |
| erase intakeBindings | planning_intake_bindings.turn_id=root; outbound source_message_id stays an owner-qualified retained identity; an unselected reverse binding referring to selected message blocks, never enlarges scope |
| erase planning/actionReceipts/observations/modelDispatches | planning_comparisons/planning_action_receipts/planning_observations/planning_model_dispatches.turn_id=root; all referenced parents must match qualified actual retained identities |
| erase checkpoints/attemptBindings/localJournals | planning_v2_place_checkpoints/planning_v2_model_attempt_bindings/planning_v2_model_local_journal.turn_id=root |
| erase executionRuns/completionProofs/completedReceipts | planning_v2_execution_runs/planning_v2_completion_proofs/planning_v2_completed_receipts.turn_id=root |
| erase callWindows/collectorOrigins/collectorOutputs/resultClaims | corresponding planning_v2_* by exact selected execution_id; no task-wide join |
| erase grounded/assistJobs/work | grounded_turns/grounded_ai_assist_jobs/work.turn_id=root |
| erase memoryConsumers | public.memory_consumer_receipts.turn_id=root AND proposal_id IS NULL; explicit Memory unchanged |
| retain taskTurns/capacity | selected service_task_turns row and its service_task_capacity task row; other Turns are never effects |
| retain budgetAttempts/textDispatches | public.model_budget_attempts exact selected legacy Turn or qualified task/scope/attempt IDs; turn_private.text_dispatches.turn_id=root; no amounts/state changes |
| retain threads/conversations/goals | distinct retainedReferences parent rows; IDs/counts only, no body redaction or deletion |

Raw provider credentials, model host secrets and policy configuration are not
Turn rows or export targets. Grounded basis/outcomes contain historical first-party
knowledge references; preserve original permitted-source/export eligibility and
current source-policy checks before publishing/downloading. No new display/cache/
export licence, new source consent or guessed provider-retention promise. If the
existing source reader cannot establish rights, export is SOURCE_UNAVAILABLE,
erasure may still qualify its original scoped private source authority.

## Closed blockers, all before effects

CONFLICTS in contract order: SCOPE_TOO_LARGE; ACTIVE_WORK; SHARED_OR_FOREIGN_SCOPE;
CROSS_TURN_REFERENCE; PROPOSAL_REFERENCE; READINESS_REFERENCE; GUIDE_REFERENCE;
SCOPED_EDIT_REFERENCE; NOTIFICATION_REFERENCE; BRIEF_REFERENCE; CORE_EXPORT_COPY;
OTHER_DELETE_PENDING; SOURCE_UNSUPPORTED.

- ACTIVE_WORK: root not completed; queued/leased work including expired lease;
  grounded queued/running; planning nonterminal; open external-call window;
  attempted/unbuffered/unknown collector; incomplete journal/execution/completion;
  budget reserved/dispatched/pending; reserved task capacity. No refund/cancel.
- Cross Turn: another text/task-history turn uses selected root/parent context;
  another service_task_turns.parent_turn_id=root; another message parent/input
  source or intake binding references selected message; another Turn's planning,
  result revision, execution or nested JSON refers to selected identities. Do not
  treat common retained task/thread/conversation/goal identity alone as a blocker
  or select their whole graph. Inspect all message source input/captured/receipt
  and result content/sourceTurnId/comparisonRef fields, including terminal copies.
- Goal current-input copy: actual 20260927021000:100-113 goal_start creates
  assistant_goals.current_text=p_text at scope_version=1; amendment increments
  scope_version and stores p_text. Determine provenance by qualified
  assistant_messages.goal_id/conversation_id/scope_version/relationship (goal_start
  or amendment), exact current goal.scope_version and the unique actual writer
  message for that version. If selected message is that current writer,
  CROSS_TURN_REFERENCE before erasure because parent goal.current_text must stay
  intact. Version/relationship provenance, never string equality/similarity.
  Common goal identity or follow_up/clarification alone is not this blocker.
  Missing/ambiguous current writer or unexpected goal body/state =>
  SOURCE_UNSUPPORTED. Include actual goal row/version/current_text and all writer
  basis rows in source CAS/row cap without returning body. Hide-selected-root also
  makes original conversation/task readers suppress task identity when
  service_tasks.goal_turn_id text.hidden_at is set (membership:153-165). If any
  other Turn/task-history/current result depends on that root/parent, block before
  hide; preserve unrelated parent reader/writer semantics. No parent Goal redact.
- Proposal: actual applied/unapplied proposal source references, artifact proposal_id,
  result proposal-preview content. Preserve confirmed Trip/history, do not repair
  a proposal after erasing its source. Source reference must be removed by original flow.
- Readiness: actual readiness_private.scopes_v1/operations Turn/message/artifact
  reference; Guide: guide_private.bindings_v1 turn/parent_turn or actual source;
  scoped edit: scoped_edit_private.work_v1/requests_v1 source/binding copies;
  notification: reminders/watches/dismissals actual source selected artifact/Turn;
  Brief: service_brief_private.briefs/previews.sources intakeMessageId and
  operations.request_bytes/receipt selected references, including stale copies.
  Parent task alone is retained; ambiguous indirect source linkage blocks accurately.
- Knowledge source impact: all SIX actual knowledge_review_private.source_impact_*
  tables, direct historical_answer target or wrapped target and copied graph/receipt
  across sets/items/pages/outbox/projections/review_requests; any matching selected
  Turn blocks SOURCE_UNSUPPORTED, including terminal/stale copies. Never invoke
  whole mixed-set invalidation through text-hide cleanup.
- Core export: actual owner mixed core_artifacts_v1 ciphertext including expired;
  queued/running/active leased jobs which might copy root. Until qualified original
  D2 cleanup can prove independent exact copy, CORE_EXPORT_COPY. Never invalidate
  all owner exports as a guessed Turn relationship. Profile-managed provenance
  does not prove Turn-managed provenance or erase rights.
- Original D3/D4/Conversation/Result/other selected-delete in flight/fence affecting
  root or actual selected parents => OTHER_DELETE_PENDING. Unknown reverse edge
  or new schema/FK is SOURCE_UNSUPPORTED. No arbitrary NULL-based success.

## Export through existing D2

One bounded owner snapshot, section `snapshot`, schema `turn-core-export/1`.
Source starts from union of owner's actual public Turns and retained text rows,
not latest Task/visible20. Includes all 35 allowlisted source groups related by
exact qualified graph, all own finite operation rows and permanent Turn fences.
Parents are IDs/necessary minimal task/capacity/budget metadata; independent
conversation/goal bodies stay in original conversations export. Deduplicate each actual PK exactly once in fixed schema-group/PK native order,
not a separate owner-wide scan of each table. Budget rows use exact selected
task + authenticated scope/attempt graph; legacy text-worker.ts:61 uses
budget taskId=lease.turnId, so qualify that exact Turn + scope owner too rather
than require a nonexistent ServiceTask join or silently drop its ledger; ownerless execution copies use exact
qualified execution IDs; no common owner/task identity alone pulls another Turn
into erasure. Export sourceAuthorities is the bounded sorted union of actual
text/message/task/dispatch/planning source pairs and original retained operations.
All are requalified under original policies/consents. No dropped orphan,
unknown source or truncation: entire snapshot fails capacity/unavailable honestly.

Page exact={schemaVersion,section,sourceDigest,items:[snapshot],hasMore:false,
nextCursor:null,sectionComplete:true}. Snapshot exact={ownerId,sources,operations,
fences,sourceRows,sourceAuthorities}. `sources` has EVERY pinned relation in schema order, each exact
{relation,rows}; rows match exact pinned columns/types/nullability/PK order. PostgreSQL bigint
and xid8 are canonical decimal STRINGS (including small values); integer is a
safe JSON integer, timestamps preserve original offset/fractional precision. Empty
groups are actual inspected empty tables, not synthesized missing-source fallback.
`sourceRows` exact={data,operations,fences}; counts equal arrays, total<=10000;
UTF8 page<=1MB. Operations use validOperationRow; fences exact={kind:'turn'|'message'|
'artifact'|'operation',objectId,requestId,createdAt}; minimal permanent IDs only.
No hidden source byte preimage in receipt/provenance.

SQL new private immutable provenance binds original owner/request/lease/generation,
snapshot canonical digest and source-state digest under original D2 clocks. TS
recomputes SHA256(exportCanonical({snapshot:items})), matches sourceDigest and
original D2 module digest; producer progress reflects actual read even if outer
byte cap rejects bundle. Original dispatch/commit/execution receipt/download must
requalify Turn source/provenance after current gates and atomically fence source
change/erase/new writer/session/account races. No changed encryption/AAD/TTL/job
receipt, byte digest or original D2 error semantics. Shared helper replacements
remain exact candidates pending current-owner release and Main lease. Export
does not imply erasure can discard a mixed core artifact; show blocker honestly.

## Native commands and envelopes

POST fixed `/api/privacy/native/v1/turn-data`; ordinary owner bearer/native proof.
RPC proposed `privacy_turn_data_v1(p_action text,p_input_bytes text,p_expected_epoch bigint)`.
Native HTTP default disabled; local opt-in DATA_TURN_DATA_LOCAL=1 only, config
environment and VERCEL_ENV absent. Original actor/session/epoch/reauth/policies
checked before feedback and inside SQL transaction; caller supplies no owner.

S exact={scope,requestId,turnId,objectIds}. Sensitive: scope turn-sensitive-data/1,
turnId one lower UUID from actual inventory, objectIds=[]. Progress: scope
turn-delete-progress/1, turnId=null, objectIds1..20 strictly sorted lower UUIDs
excluding new requestId. Command exact:
list={action:'list',scope,cursor:null|{sourceDigest,afterId},limit:20};
preview={action:'preview',...S}; erase={action:'erase',...S,sourceDigest,previewDigest,
confirmed:true}; recover={action:'recover',...S,mutationBytes:ORIGINAL erase bytes}.
8192-byte mutation;16384-byte recovery outer. Recovery is read-only. No replay
erase, reserialization, new ID or automatic export-conversion/confirmation.

B exact={schemaVersion:'turn-data/1',...S,ownerId,sessionId,mobileEpoch,sourceDigest,
previewDigest,sourceAuthorities,capturedAt,expiresAt,boundaries,allUserDataCompleted:false}.
Epoch ms; expiry exactly capturedAt+30000 and never renewed. SourceAuthorities
0..100 original actual {policyId,consentId}, sorted/deduped; sensitive >=1, progress
union of selected original operations. Requalify SAME original pairs at erase,
terminal replay/recovery beyond TTL, export commit and download. Unknown/replaced/
revoked consent is unavailable, never a substituted global/new consent.
Boundaries must exactly equal TURN_BOUNDARIES; render all four arrays before erase.

Preview exact={...B,kind:'preview',graph,eraseCounts,redactCounts,retainCounts,
retainedReferences,conflicts,eligible,progressCount}. All count keys exact constants
in contract, natural <=10000; total affected/retained rows<=4100; body<=1MB.
Sensitive progressCount=0; progress scope has empty graph/references/counts,
progressCount=objectIds.length. Eligible iff no conflicts, not HTTP success alone.

List exact={schemaVersion,kind:'list',scope,ownerId,sessionId,mobileEpoch,sourceDigest,
capturedAt,expiresAt,items,hasMore,nextCursor,allUserDataCompleted:false}; IDs strict
ascending,20+sentinel,cursor source-CAS. Sensitive item exact={turnId,threadId,
taskId:null|UUID,createdAt,status:'completed',erased:boolean}. No title/output.
Progress item exact is validOperationRow in protocol.ts, finite graph/counts/
references/conflicts or NULL only after explicit preview erasure; no recursive
receipt or original raw text. Late list change fails source CAS, not guessed end.

Receipt exact={...B,kind:'receipt',state:'erased',decision}; D exact={requestDigest,
decidedAt,graph,erasedCounts,redactedCounts,retainedCounts,clearedPreviews,
retainedFences,sourceTurn:'erased'|'not_modified',parentData:'not_modified'|'selected_digest_redacted',
sourceTrip:'not_modified',explicitMemory:'not_modified',financialData:'not_modified',
externalCopies:'not_erased'}. Independently count actual effects, not preview echoed.
parentData is EXACTLY selected_digest_redacted iff redactedCounts.taskDigests>0,
otherwise not_modified; progress always not_modified. Other parent content/status/
versions remain unchanged. Retained boundary names the selected-root digest exception. Sensitive clearedPreviews=0 and
retainedFences=sum graph lengths; progress sourceTurn not_modified, count<=selected,
retainedFences=selectedCount. Decision timestamp inside ORIGINAL expiry, retained
receipt readable after expiry only under original current authority. Exact
requestDigest=SHA256 ORIGINAL mutation UTF8. Immutable decision and bytes stored
internally, no sensitive source preimage. Unknown exact={schemaVersion,kind:'unknown',
...S,ownerId,sessionId,mobileEpoch,requestDigest,allUserDataCompleted:false}.

## SQL/lock/late writer integration boundary

New SQL owner only after Main whole wire/schema/unused-slot adjudication. New
private module operations + immutable decisions/original mutation bytes + source
identity fences/provenance; no edit applied migrations or new target grants/roles.
Original root/task/account lock order must be sourced before implementation:
auth owner KEY SHARE NOWAIT, existing account/session guards, original task/entity
advisory locks consistent with actual writers, selected row NOWAIT, source policy
and all current graph rows. Eraser owns exclusive selected-identity advisory locks;
ordinary writers share only relevant entity locks and preserve original concurrency
and error semantics. No new account-wide writer serialization or blanket session
ban. Try/NOWAIT conflict rolls back whole erase, never partial acknowledgement.

Guard known source tables on INSERT/UPDATE/DELETE, BOTH OLD/NEW Turn/message/
artifact and old/new parent references including nested historical_answer, result
and message-source content. Parent identities are retained, not fenced by this
module. Turn text/input marker+NULL output is legitimate irreversible sensitive
erasure ONLY with matching full source effect proof and permanent root/message/
artifact fences. Protect after restore/late worker/ID reuse, movement from erased
to fresh parent and opposite, malicious historical replay. Fresh unrelated Turn
under same parent/owner must keep original writer/error semantics and succeed.
Unknown table/FK/source drift fails closed before mutation/publication/download.

Required affected proof: real source schema/owner/Auth registered HTTP/D2 private
download, all actual legacy/current modes, active/foreign/mixed revision/messages/
Guide/Brief/proposal/knowledge negatives, exact independent effects and untouched
parents/otherTurns/Trip/Memory/budget, byte/CAS/30s/source/session/account/lostACK
and progress finite recovery, controlled original producer concurrency and OLD/NEW
late writer fences. Fixtures are protocol evidence only; Main whole-batch review,
unique PR/exact formal/current applicable CI/protected merge remain separate.
No target GRANT/CREATE ROLE/keys/provider fees/Storage/APNs/deploy/device actions.

## Scoped TS verification

2026-10-08: command/closedpreview/receipt/finiteprogress/HTTP original-bytes and
lostACK fixture 5/5 PASS, 0skip. Independent export/source-shape/authority/legacy
budget decimal/dispatcher/encrypted bytes fixture 5/5 PASS, 0skip. Early export
fixture assertions incorrectly assumed orphan owner text outside a public Turn
must fail (root union intentionally preserves actual retained text), chose a byte
cap above actual snapshot size, and compared decrypted Buffer with object; these
fixture FAILs were corrected under the unchanged source/byte contract and retained
here, not called runtime SQL failures or retroactive PASS. Source lint/typecheck/
docs/diff PASS; no ESLint binary in dependency bundle (repository lint uses
scripts/lint.mjs, actual lint PASS). SQL/Auth/registered real owner HTTP/original
D2 private download/Native same-source and target/device verification UNRUN.

Shared-registration candidate is exactly worker import/Turn handler/bundle+
receipt qualification and four coverage additions. It retains nine core modules,
34 coverage denominator entries, original encryption/download/currentness gates.
Candidate catalog .11 follows Offline .10 only after actual current-owner release
and Main exact lease; this candidate is not installed or live registration.
