# VPJ-08 sole final candidate wire / assistant-events/1

Owner: sole TS integrator, branch `vpj08-assistant-events-server-20261010`, exact base `6e341f10e6076d259e1781246c493d5d60137e71`.
Additive reader is default deny: `VISEPANDA_NATIVE_ASSISTANT_EVENTS` must explicitly equal `true`; no environment setting changed. Existing text config is still required. Original producer flag remains independent.
First executable files: `lib/server/turn/assistant-events/{protocol,http,transport}.ts`, `app/api/chat/native/v5/assistant-events/[conversationId]/route.ts`.
Main approved the minimal source_retired extension on2026-10-10; this is the single TS wire for SQL/Native alignment. SQL implementation and Native registration remain required. No durable runtime claim yet.

GET `/api/chat/native/v5/assistant-events/{conversationId}`. Ordinary signed native Bearer only; no cookies/origin/query/body/alternate credentials. `Last-Event-ID` is the original decimal sequence grammar (0..999999999999999), default 0. Scope cursors by complete actor/session/epoch plus conversation; never reuse across a changed scope. Header is sequence, not eventId.

RPC `read_assistant_events_v1(p_policy_id uuid, p_conversation_id uuid, p_after_sequence bigint, p_limit integer)`; HTTP fixes limit 50. Success has **exact** keys:

```
{kind:"assistant_events",schemaVersion:"assistant-events/1",conversationId,
 afterSequence,lastSequence,hasMore,events:[...]}
```

`events` is 0..50 contiguous conversation sequence rows strictly after the requested sequence; `lastSequence` equals the last admitted event or requested sequence for an empty page. It is never global max/high-water or sentinel. `hasMore=true` requires 50 admitted events and an authorized 51st sentinel. Do not skip inaccessible rows, truncate serialized rows, or advance to a hidden event. Deny the whole page instead. Future cursor and nonzero missing cursor fail. Contiguous sequences require transactionally serialized per-conversation allocation, never a PostgreSQL identity with rollback holes or commit-order inversion.

Every event has exact common keys `eventId,sequence,type`; the original five live variants additionally require non-null UUID `taskId,turnId` with their original exact fields. The sixth variant source_retired has neither field. eventId = `conversationId + ":" + decimal sequence`. Additional fields are closed by type:

| type | additional fields | original authority |
| --- | --- | --- |
| task_status | status (accepted/planning/retrieving/generating/validating/completed/proposal_ready/unavailable/failed/cancelled) | persisted chat_turn_events |
| task_progress | tool (evidence.lookup/place.read/constraints.evaluate/result.prepare), state (started/completed/unknown) | planning_action_receipts transition |
| artifact_ready | artifactId, revision (1..1000), availability (recheck/unavailable) | result_events ready |
| artifact_updated | same | result_events revised |
| artifact_invalidated | same, availability MUST unavailable | result_events withdrawn |
| source_retired | retiredSequence (positive safe integer <= own sequence); no taskId/turnId or other field | original authorized source deletion scrub + atomic ordinal notification |

Source retirement exact event shape is `{eventId: conversationId+":"+sequence, sequence, type:"source_retired", retiredSequence}`. No artifactId/revision/taskId/turnId/status/tool/state/raw tuple/reason/time, including null-valued fields. In the original authorized source erasure transaction, matching old outbox rows become ordinal-only source_retired with retiredSequence=own sequence; original source metadata and dedup tuples are scrubbed. The same original counter atomically appends one idempotent notification referencing each old ordinal. A deleted-source anchor remains a valid ordinal while its retained authorized conversation can replay later legitimate Tasks. Do not retain erased source IDs, silently skip hidden/inaccessible live rows, reset cursor or invent an epoch/parent fence. Whole conversation/account deletion still cascades its bookkeeping.

Native retires only the cached hint keyed by conversationId+retiredSequence after complete-page validation and original actor/session/epoch/policy/conversation qualification. An old-ordinal tombstone is harmless on replay; a later notification clears an already acknowledged hint. Repeat delivery of the same eventId is idempotent. Repeated notification references never restore source metadata or content. Source retirement does not assert Task cancellation or usage/billing outcome and grants no dispatch/Trip operation. SQL may emit only canonical authorized retirement, never substitute retirement for a current permission/policy denial. All existing live-source qualifications and permanent fences remain mandatory. The TS decoder preserves contiguous delivery and rejects the whole page on unknown or partial fields before SSE IDs.

Availability `recheck` grants no content/currentness authority. All events are status/invalidation hints. Native must fence active actor/session/epoch/conversation/request generation, dedup by eventId, apply invalidation without focus/scroll changes, and use original exact artifact/revision GET plus current source checks before displaying content. Historical ready after later withdrawal is unavailable. An event cannot revive withdrawn content, settle usage, dispatch work, pay or confirm/apply Trip.

Transport: finite SSE page, `event: assistant`, `id: sequence`, JSON data = schemaVersion/conversationId + closed event. End with id-less `checkpoint` containing exactly schemaVersion/conversationId/afterSequence/hasMore and retry 2000. Follow pages immediately only for hasMore; otherwise bounded reconnect per client active lifecycle. Request lifetime 10s; max serialized page and max SSE bytes each 65536. No terminal assumption at conversation level. HTTP validates the whole page before emitting any id. Error response has no cursor: INVALID_INPUT400, UNAUTHENTICATED401, DATA_POLICY_BLOCKED403, INTERNAL_ERROR500 (malformed reader), PROVIDER_UNAVAILABLE503 (missing RPC/config/transport).

Server process loss requires no process memory: replay resumes from SQL outbox. Native must persist only qualified scope/cursor and safe metadata; suspend/cancel/clear on scope change; do not equate disconnected delivery with task cancellation or settled accounting. Missing tail usage stays pending-accounting in original ledger.

Rollback disables the new reader/consumer only; original grounded/task activity/result GET and read/cancel remain. No old consumer schema or flags changed. Producer mode off must not by itself deny retained authorized replay.
