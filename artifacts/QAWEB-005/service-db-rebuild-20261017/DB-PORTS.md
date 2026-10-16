# DB-REBUILD-20261017 — unchanged QA service / DB port contract

Actual cwd: `/Users/jtsm5p/Documents/Codex/VP-V10-worktrees/db-rebuild-service-20261017`.
Branch: `codex/db-rebuild-service-20261017`.
Verified QA source/base: `7093ca0409e6cf00720df229231c1f6587ce8b8c` on the actual
`codex/qaw005-independent-target-20261013` QA branch (PR733 base metadata and
remote HEAD checked). New WT was created from the older default main then normally
fast-forwarded to this QA source before product work; no reset or old-WT edit.
Initial tracked/staged state clean. Tool FS workspace-write, network restricted
with permitted read-only Git/push escalation; requested Sol6.1/medium, effective UNKNOWN.

First source-tool evidence: current service.ts exposes injectable `QaStore`;
native-store.ts consumes existing native_session_v2 plus atomic qa_native_session_v1;
HTTP routes and worker still call the original QA/ModelGateway ports. Their source
bytes match the prior delivered QA implementation; no missing service behavior
has been reproduced merely because the DB implementation is being replaced.

**Main → exclusive DB baseline owner input:** `ports.json` lists exact current
public parameter names/types, caller class, return tags, Native closed actions
and source hashes. This is an unchanged-caller contract, not SQL, a new API,
GRANT authority or a proposal to replay historical migrations. Main coordinates
any mismatch; this owner writes neither baseline SQL nor shared Auth/identity/
turn/context/registry/CI/config/worker host/UI files.

## 1. Scope and milestone

Target remains existing Go2China / `dzqdzetcctkhbrhlxxgn`. No new Supabase project,
endpoint/ref fallback, target clearing, online switch, old snapshot restore or
full-history migration prerequisite. Old data/source/APIs/resources stay intact.
Empty local PG with synthetic roles/identities is development proof only.

- M0: freeze current API → repository → DB port mapping, prove source reuse and
  document actual repository dependencies. This delivery is that review input.
- M1a: fixed c66a58b8 baseline consumed through its reusable Fixture.start/sql/close
  and committed SQL. Declared Native read/consent/epoch/recovery slice **PASS** through
  real loopback route/SDK/service→owned empty PG; see CONSUMER-C66.md and raw proof.
- M1b: complete first answer/admission/worker/budget/result write closure **UNRUN**,
  not supplied by c66. No old container, restore, real identity or target is borrowed.
- Adapter implementation is warranted only for a concrete reproduced difference
  in that contract. Existing QaStore and worker dependency injection already
  provide seams; no new repository/queue/authority is needed if ports are preserved.

## 2. Original public HTTP / wire contract, both consumers

Browser prefix `/api/qa-agent`; Native prefix `/api/qa-agent/native/v1`.
Both preserve `qa-agent/1` from lib/server/qa-agent/contract.ts. Worker `/4` is not
an HTTP version. Native requires original verified Bearer + active mobile epoch;
Browser requires original Cookie/Origin boundary and refuses Bearer. Never proxy
Cookie into Native or accept ordinary Web JWT as an active Native context.

| HTTP suffix | Request | Success |
| --- | --- | --- |
| GET policy | none | 200 `{version,policy}` |
| POST consent | exactly `{policyId,noticeHash}` | 200 `{version,policy}` |
| GET sessions | none | 200 `{version,sessions}` |
| POST sessions | exactly `{}` | 201 `{version,session}` |
| GET sessions/{sessionId} | none | 200 `{version,session,messages,historyLimit:20,policy}` |
| POST sessions/{sessionId}/messages | exactly `{requestId,text}` | 202 `{version,requestId,turnId,sessionId,status:pending,reused}` |
| GET sessions/{sessionId}/messages/{requestId} | none | 200 `{version,message}` |

Session: `{id,label,createdAt,updatedAt}`, id is original chat_threads UUID.
Message: `{requestId,turnId,sessionId,input,text,status,createdAt}`. Policy:
`{id,noticeHash,noticeZh,noticeEn,provider,recipient,consentState,contextMode,maxTurns}`;
P0 mode is explicitly `qa_session_history_v1`, maxTurns8. No noticeVersion invented.

Wire status: pending, reconciliation_required, answered, partial, clarification,
blocked, technical_failure. Failure: `{version,error:{code,ack}}`; INVALID_INPUT400,
UNAUTHENTICATED401 (includes SESSION_REPLACED), FORBIDDEN403, DATA_POLICY_BLOCKED403,
IDEMPOTENCY_KEY_REUSE409, QA_CONTEXT_LIMIT409, PROVIDER_UNAVAILABLE503. ack is
not_submitted or unknown. Missing/unknown RPC/schema/network is not an identity
denial or a synthetic success. HTTP202 is admission pending, never an answer.

Cancellation suffix adds `/cancellation`, GET or POST with exact `{}`. Original
`qa-cancellation/1` exact five-field receipt: version/sessionId/requestId/state/ack;
state pending|cancelled|terminal|not_observed; observed only for cancelled/terminal,
otherwise unknown. Error ack not_submitted concerns the stop request, not original
admission. Generation disabled/withdrawn consent does not require new generation
admission to stop an already-owned original request.

## 3. Repository seam and transport-specific dependencies

`createQaService(store,policyId,qa_session_history_v1)` consumes the existing seam:

```text
list() -> Thread[]
create() -> Thread
read(id) -> {thread:Thread,turns:[{id,status,createdAt}]}
rpc(name,namedParams) -> {data:unknown,error:null|{message:string}}
Thread = {id,status,createdAt,updatedAt}
```

**Browser actual dependencies:** existing createUserDataAdapter uses ordinary
Cookie-authenticated RLS operations on chat_threads (list/create/read), turns,
chat_turn_events, turn_feedback, memory_consumer_receipts (nonempty detail).
Exact projections in identity/user-data-adapter.ts:1041–1122:

| Relation | Existing read/write projection |
| --- | --- |
| chat_threads | read id,trip_id,status,created_at,updated_at; insert owner_id + trip_id:null |
| turns | id,status,created_at,updated_at filtered by thread_id |
| chat_turn_events | turn_id,event_id,sequence,event_type,state,created_at filtered by thread_id |
| turn_feedback | id,turn_id,feedback_kind,reason_code,created_at filtered by thread_id |
| memory_consumer_receipts | turn_id,memory_id,source_receipt_id,constraint_kind, filtered consumer_kind=turn and turn_id set |

The QA service only uses thread/turn metadata, but the general Browser adapter
still queries the latter auxiliary relations. If the empty baseline omits them,
the current Browser detail path can return503 despite valid QA RPCs. This is a
concrete source dependency to resolve with Main/DB owner: preserve proper original
RLS-compatible tables/semantics, or identify an explicit metadata repository
contract gap before this owner makes a minimal QA-owned adapter change. Do not
create fake successes, suppress an actual RLS denial or edit the shared identity
adapter. Native does not require those auxiliary reads for its QA metadata.

**Native actual dependencies:** original ordinary JWT/JWKS verification,
native_session_v2, then qa_native_session_v1 for every operation. Strict precheck
result exactly `{version:2,subject,sessionId,mobileEpoch}`; subject/sessionId match
verified JWT, mobileEpoch positive safe integer. Each actual read/write must
revalidate that same epoch under original account/session lock in its own DB
transaction. A precheck receipt alone never authorizes later side effects.

Atomic Native RPC is `(p_action text,p_mobile_epoch bigint,p_payload jsonb)`.
Closed list/create/read payloads are `{}`, `{}`, `{p_thread_id}`. Returns exactly:
`{kind:threads,threads:Thread[]}` (≤20), `{kind:thread,thread:Thread}`, or
`{kind:thread_read,thread:Thread,turns:[{id,status,createdAt}]}` (≤8). Dates are
parseable strings, IDs unique UUIDs, metadata bound to requested Session. Other
allowed actions only the seven original QA policy/consent/list/session/submit/
text/cancellation ports in ports.json; no arbitrary function, worker or budget action.
Keep INVOKER/RLS authority; no privilege expansion or token minting. Cancellation
capacity(owner,34) lock precedes account/epoch lock.

Independent iOS owner's supplied audit `dda77a991cda08d5397e52f1fa34d4dca3a2d75f`
also identifies existing native_prepare_v2/native_session_v2 and user_profiles
as login/restore/profile dependencies outside this service owner's write scope.
Do not replace real Auth exchange/proof with a claims echo. Local synthetic Auth
and JWT fixtures are labeled separately from actual GoTrue/account/device proof.

## 4. DB results consumed by unchanged QA service

1. qa_read_policy_v1: `{kind:policy,policy:...}` with exact deployed policy UUID,
   nonempty bilingual notice/provider/recipient, 64lowercase-hex noticeHash,
   consentState not_accepted|accepted|withdrawn, QA mode/maxTurns8.
   qa_accept_policy_v1 returns `{kind:accepted,policyId}` after real notice/actor check.
2. qa_list_sessions_v1: `{kind:sessions,sessions:[{threadId,...}]}`, ≤20 unique IDs.
   qa_read_session_v1: `{kind:session,schemaVersion:qa-session/1,threadId,policyId,
   serviceTaskId,lastTurnId,messages}`; ≤8 messages, unique IDs, canonical parent order.
   Empty Session requires null policyId/serviceTaskId/lastTurnId, not fabricated IDs.
3. Each protected message contains `{kind:text,turnId,input,output,outcome,
   reconciliationRequired:boolean}`. Original metadata supplies canonical status/date.
   Output and outcome are both null or coherent saved values; pending cannot have
   invented completed text. True reconciliation requires null output/outcome and
   durable original dispatch/attempt evidence; absence of text is insufficient.
4. qa_submit_message_v1 uses the exact eight named parameters in ports.json and
   returns `{kind:accepted,turnId,reused:boolean}`. Original policy/notice/consent,
   actor/session/Task scope and idempotency checks remain atomic. False/unavailable
   admissions never become an answer. SQL errors retain the original code strings
   mapped by rpcError, not a permissive truthy receipt.

Stable request bytes: normal producer uses requestId=turnId=idempotencyKey. First
Task ID is the unchanged service's deterministic original Session namespace;
followup/retry uses persisted serviceTaskId. Replaying an old request after newer
turns resolves its original parent, not the current last turn. Same key/different
text is conflict, not another admission; UTF8/UTF16/whitespace bytes are not normalized.
Cancellation still resolves original request→Turn mapping, including existing
canonical mappings whose stored request and Turn IDs differ.

Snapshot races keep current bounded refresh (at most2 metadata +2 protected text
reads), then retryable503 rather than partial history or fabricated consent denial.
Reopen reads original persisted text/Turn/event; no client-only history authority.

## 5. Original worker / context / budget closure

Native and Browser feed the same original queue. qa_claim_work_v1 returns empty,
reconciliation_required, or leased with exact ownerId, valid turnId/leaseToken,
attempt≥1 integer and 1≤leaseMs≤120000. qa_read_work_v1 returns blocked or the
closed `qa-context/1` envelope: kind=qa_input, schemaVersion, contextMode, ownerId,
authSessionId,turnId,threadId,serviceTaskId,policyId,consentId,provider,endpoint,text,
locale,history,sourceTurnIds,contextDigest. Its exact digest, source eligibility,
permissions and byte bounds belong to the original context authority (other owner).

The unchanged /4 root uses qa_ready_groups_v3 with trusted project/owner/policy/
scope/notice binding. Filter exact tuple/model/price/endpoint before LIMIT and
retain original unique qualifying budget scope; groupLimit1 is not actor authority.
The context's logical qa_authorize_dispatch_v1 is adapted to physical v2 with
independent owner/notice params; v2 checks actual policy notice then original v1
retains atomic original budget dispatch and final protected reread. No new queue,
fresh policy, caller model selection or extra preceding dispatch_model_budget call.

Original reserve_model_budget must canonically bind Turn task alias to persisted
ServiceTask/scope. Successful dispatch→validated usage receipt→finish_model_budget
settled/overrun:false precedes qa_complete_work_v1 finished + persisted original
output/terminal event. DB completed tag without original accounting/qualified
source does not establish a real answer. Service supports answered/partial/
clarification/blocked/technical_failure, not arbitrary provider raw text.

Definite exact `{kind:blocked}` dispatch releases only its not-dispatched reserved
attempt. Unknown dispatch/transport/usage/settlement/completion ACK retains original
reserved/pending/reconciliation; never0-cost settle, automatic resend or new UUID.
Same fixed original EG/ModelGateway model/endpoint/price/configuration selection,
conservative reservation and per-step execution fences remain. Operator real policy,
consent, scope/currency/limits, fee permission and provider credentials are not supplied
by this file. Empty synthetic data cannot imply they are live or accepted.

Optional dedicated hosted entry additionally consumes original
read_hosted_worker_status / hosted_worker_heartbeat; files-mode starts disabled.
These signatures are listed for the existing host owner, not authority for this
task to start/install a worker, read keys, modify shared root or enable a switch.

## 6. Reuse conclusion / exact remaining dependency

Source inspection and prior exact-source evidence establish an already implemented
API→QaStore/atomic Native store→original QA/worker path. No new service code or
repository is justified for **unchanged DB ports**. The Browser auxiliary metadata
relations are the one explicit minimal-schema coupling to discuss, not a reason
to require every old migration or invent a second repository up front.

Consumed input: DB owner c66a58b8 fixed source/SQL and reusable Fixture lifecycle;
independent owned-resource API consumption PASS for its declared read slice. Next
required input is the write/worker closure under a new stable baseline head. Any
actual mismatch will be reported by parameter/field/code and affected caller;
only an evidenced QA-owned adapter gap will be implemented. Baseline/schema/Auth/
RLS/native/identity/turn/context or registry differences remain with their original
owners via Main, without blocking unrelated safe source work.

M1a declared-read empty-PG API consumption is PASS; full first answer/write closure,
target DB, real Auth/provider/fees, iOS/device and release remain UNRUN. This does not claim DB rebuild done. No dependency on old snapshots,
restore success or full migration replay is reinstated by this port review.

## 7. Astra first increment versus the complete answer path

Main's fresh first-increment report names Native session validation, Session
reads, consent and unknown-ACK projection; submit/worker remain uncovered and
must fail closed. c66a58b8 and its Fixture interface have now been consumed on new
owned resources; CONSUMER-C66.md gives the independent API proof. Labels below
retain the original slice distinction; only that declared read scope passed.

| Slice | Exact ports / smallest behavior to prove | Status of this delivery |
| --- | --- | --- |
| Declared Native identity/read | native_session_v2 strict active epoch; qa_native_session_v1 list/read plus original qa_list_sessions_v1/qa_read_session_v1/read_text_turn actions | c66 declared read ports consumed by actual API/SDK/service on owned PG: PASS |
| Declared policy/consent | qa_read_policy_v1/qa_accept_policy_v1, exact notice/hash/actor, QA mode and real acceptance/withdrawal | c66 actual policy/consent consumed: PASS; notice is explicitly synthetic |
| Declared unknown-ACK projection | original scoped Session/Turn/result read; reconciliationRequired from durable authority; cancellation receipt read if present | Must retain unknown bytes and scope; missing row does not prove original not_submitted. Exact projected ports/source still need baseline verification |
| Missing sending/admission closure | qa_submit_message_v1 atomic original request→Task/Turn/queue and byte idempotency, behind Native epoch wrapper | Not established by first increment; cannot obtain first answer without it |
| Missing worker closure | qa_ready_groups_v3, qa_claim_work_v1, qa_read_work_v1, physical qa_authorize_dispatch_v2 and original delegated v1 authority | Not established; original owner/policy/scope/notice/model binding required |
| Missing budget/result closure | original reserve/dispatch/finish_model_budget and qa_complete_work_v1; output + original terminal Turn/event durable atomically | Not established; no synthetic answer or zero-cost success |
| Full persist/reopen | after actual qualified completion, same original Session/request GET and followup with same Task, no re-admission on refresh | Read-only first increment cannot demonstrate this until the writes above exist |

Fail-closed technical stub semantics matter: unchanged service.call maps JSON
`{kind:blocked}` and `{kind:unavailable}` to DATA_POLICY_BLOCKED403, so these tags
must not disguise an **unimplemented technical port** as consent refusal. Use a
normal explicit technical RPC error (e.g. PROVIDER_UNAVAILABLE message, preserving
the original error envelope) or genuine missing-RPC failure. The current service
returns503; a failure at the actual submit RPC preserves ack unknown. It does not
return accepted/pending/answered for a nonexistent admission, auto-retry, invent a
Turn, or erase retained request bytes. This notes existing behavior, not a change
to the HTTP/SQL error contract or a demand to alter shared service code.

Native login/bootstrap additionally needs existing trusted native_prepare_v2 and
real Auth/user_profiles interfaces. A session-read-only proof does not establish
login proof exchange, GoTrue issuer/JWKS, live actor data or provider permissions.
The completed iOS consumer audit is reused; no consumer rewrite is requested.

Main can send this exact missing write/worker/budget/result list to the same DB
owner now. A later scoped adapter is justified only by a concrete baseline DTO/
RPC difference. No new parallel service implementation or migration history
precondition is introduced to occupy another implementation line.
