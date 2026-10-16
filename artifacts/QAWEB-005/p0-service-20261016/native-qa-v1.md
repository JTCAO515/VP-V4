# Native QA v1 producer / iOS consumer contract

Continuation of original #680 in the existing owner/WT. Base before new source:
`ccaa2dd3` (includes the reviewed QA4abe Agent/runtime code); unrelated prior
diagnostic commits/dirty symlink preserved. No original QA service/contract,
Browser route/boundary, identity helper/config, old Native route or worker edited.

## Stable HTTP contract

Prefix **`/api/qa-agent/native/v1`**. `v1` is the Native HTTP surface version;
worker profile `/4` is independent. Success/error DTOs are the original
`lib/server/qa-agent/contract.ts` **`qa-agent/1`**, not Native text v1/v2 DTOs.

| Method / suffix | Body | Original response / status |
| --- | --- | --- |
| GET `/policy` | none | QaPolicyResponse / 200 |
| POST `/consent` | `{policyId,noticeHash}` | QaPolicyResponse / 200; no noticeVersion field |
| GET `/sessions` | none | QaSessionsResponse / 200 |
| POST `/sessions` | `{}` | QaCreateResponse / 201 |
| GET `/sessions/{sessionId}` | none | QaDetailResponse / 200 |
| POST `/sessions/{sessionId}/messages` | `{requestId,text}` | QaSubmitResponse / 202, status pending, original reused flag |
| GET `/sessions/{sessionId}/messages/{requestId}` | none | QaMessageResponse / 200, protected persisted original result |

Use the existing NativeSession private dataRequest Bearer transport. Cookie,
Origin (including empty), query parameters, ambiguous credentials and extra
body fields refuse; JSON POST and byte/time bounds apply. No Cookie proxy,
caller owner/model/policy-history/Task selector or new queue. UUID identity is
canonical lowercase on the adapter; input text bytes are unchanged. Native
mobileEpoch is captured server-side after original native_session_v2, never an
HTTP body parameter selected by iOS.

Errors retain original QaFailure: INVALID_INPUT400, UNAUTHENTICATED401,
FORBIDDEN403, DATA_POLICY_BLOCKED403, IDEMPOTENCY_KEY_REUSE409,
QA_CONTEXT_LIMIT409, PROVIDER_UNAVAILABLE503; ack not_submitted or unknown.
An unknown submit ACK means retain the original requestId/text and GET that
same request; explicit same-key retry remains idempotent. Do not generate a new
request or infer a free retry/refund/answer from HTTP202.

Cancellation adds GET/POST
`/sessions/{sessionId}/messages/{requestId}/cancellation`; POST body exactly `{}`.
It uses **the original createQaCancellationService**, returning the unchanged
five-field **qa-cancellation/1** receipt `{version,sessionId,requestId,state,ack}`.
States pending/cancelled/terminal/not_observed; only cancelled/terminal have
ack observed, other states unknown. Errors are the original cancellation failure
envelope. Unknown stop ACK is resolved by GET, never a new original admission.
Stopping/recovering remains available without generation enable or fresh consent.

## Real producer and atomic authority

New routes call `nativeQaHTTP` / `nativeQaCancellationHTTP` and new native-store;
these call the unchanged `createQaService` or cancellation service. All native
SDK data calls use only the ordinary JWT. JWT verification is preparation, not
NativeActorContext. Original native_session_v2('session') must return strict
version2/subject/sessionId/mobileEpoch matching that JWT before building a store.

Every store list/create/read/original QA RPC is then performed through new
`public.qa_native_session_v1(text,bigint,jsonb)` in the exclusively allocated
`20261016060000_qa_native_session.sql`. It is **SECURITY INVOKER**, postgres-owned,
empty search_path, ordinary authenticated-only EXECUTE; no table/schema/role/RLS
privilege is added. The original native_session_v2 account lock/active-session
check and exact captured epoch comparison remain held in the **same transaction**
as the delegated QA operation. The earlier HTTP precheck cannot authorize a later
write after replacement. Original public QA definers retain policy/consent/Task/
Turn/admission/worker/budget authority; direct original table operations retain RLS.

The wrapper statically dispatches only list/create/read and the original seven
QA read/policy/consent/submit/cancel ports, with closed JSON keys/types. It cannot
invoke service-only claim/budget/provider ports or arbitrary functions. It reads
PostgREST's existing JWT claim settings for binding comparison, then relies on
original native_session_v2 as authority; it does not grant access to auth schema
or mint identity. The initial invoker experiment directly naming auth.uid failed
under ordinary fixture permissions; the solution preserved those permissions.

Cancellation preserves original advisory capacity(owner,34) → account/session
lock order before calling the original cancellation function. It never adds
budget settlement, re-enrollment or a second writer for the Turn.

## Configuration boundary for Main

New generation requests require the **intersection** of existing qaConfig and
getNativeRuntimeConfig(trip,text), same DB URL/public key, explicit QA context
mode qa_session_history_v1, and no Production. Missing/ambiguous configuration
fails closed. The original finite Vercel Preview deployment URL is usable when
both existing configs accept it; no new host allowlist or hidden flag is added.
Current qatesting alias is still refused by the old Native stagingRequest and
needs Main's separately coordinated host seam. No env/deployment changed here.

Cancellation uses that same existing Native/QA target intersection but original
qaCancellationConfig, so generation flag/policy ID withdrawal does not require
fresh generation consent or block stopping an owned existing QA request.

## Verification and limits

- Actual loopback HTTP **route exports**, original Supabase Bearer SDK and shared
  QA service: policy/consent/create/list, lost admission ACK, same-ID GET and
  persisted synthetic answer reopen, same Task followup/retry, text preservation,
  foreign IDs, Cookie/Origin/query/extra/oversize/ambiguous/expired credentials,
  precheck-to-operation replacement, old Browser Bearer refusal, cancellation
  lost ACK→GET, disabled generation stop, finite Preview/QA-alias/Production gates.
  `node --experimental-strip-types --test tests/security/qa-agent-native/http.test.mjs`
  Test uses synthetic signed JWT/RPC responses, not real GoTrue or provider.
- Real isolated ordinary-role PG17 replays original162 source migrations plus
  only the new Native migration; exact old function source/ACL/config and table
  RLS/ACL unchanged. Original prepared mobile login/session authority, two actors,
  RLS isolation, original QA consent/submit/idempotency, original SQL worker
  synthetic completion, reopen/followup, epoch replacement and cancellation checked.
  `QA_NATIVE_PG=1 node --experimental-strip-types --test tests/integration/qa-agent-native/postgres.test.mjs`
  Explicit native17 opt-in; Main owns CI registration. These are isolated Auth
  rows/claims and synthetic cost/result, not target accounts, provider cost or UAT.
- TypeScript/lint/diff checked; prior unaffected71/18 evidence reused, not rerun.

Actual target migration, source-guard/ACL registration, host/env activation,
GoTrue login, real provider answer/fee, iOS execution/device and release: UNRUN.
Stable producer contract does not claim the current deployment has this RPC or
has accepted any real session. Main owns protected review/CI/merge and all target
permissions. No shared SQL, restore, key/account, deployment or TF operation.
