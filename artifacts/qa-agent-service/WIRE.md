# Frozen qa-agent/1 browser wire

All responses include `version: "qa-agent/1"`; private/no-store, Cookie/Origin vary.
Cookie SSR identity only. POST requires exact same Origin and application/json;
Authorization, cross-site and query parameters rejected. No client model/history/Trip fields.

- GET `/api/qa-agent/sessions`: 200 `{sessions:[{id,label,createdAt,updatedAt}]}`.
- POST same path `{}`: 201 `{session:{id,label,createdAt,updatedAt}}`. Original chat_threads ID; label is truthful generic `Session` metadata. No Trip.
- GET `/api/qa-agent/sessions/:sessionId`: 200 `{session,messages,historyLimit:20,policy}`; newest 20 original protected turns in chronological order.
- POST `/api/qa-agent/sessions/:sessionId/messages` `{requestId:UUID,text:string}`: 202 `{requestId,turnId,sessionId,status:"pending",reused:boolean}`. requestId equals original turn/idempotency ID. Accepted does not mean answered.
- GET `/api/qa-agent/sessions/:sessionId/messages/:requestId`: 200 `{message:{requestId,turnId,sessionId,input,text,status,createdAt}}`. `text` is saved original output or null. Status pending/reconciliation_required/answered/partial/clarification/blocked/technical_failure. Refresh/retry poll the same original ID.
- GET `/api/qa-agent/policy`: 200 `{policy:{id,noticeHash,noticeZh,noticeEn,provider,recipient,consentState,contextMode,maxTurns}}`.
- POST `/api/qa-agent/consent` `{policyId,noticeHash}`: 200 same policy envelope, server reads immutable notice/consent. UI must show notice and await explicit acceptance before calling; no implied consent.

Errors `{version,error:{code,ack}}`: INVALID_INPUT 400; UNAUTHENTICATED 401;
FORBIDDEN 403; DATA_POLICY_BLOCKED 403; IDEMPOTENCY_KEY_REUSE 409;
QA_CONTEXT_LIMIT 409 with ack:"not_submitted";
PROVIDER_UNAVAILABLE 503. ack `unknown` means original submission may have committed;
retain same requestId/text and poll/replay. Never generate another UUID for an unknown ACK.
No raw transport/DB/provider messages, content, headers or credentials in failures.

QA environment contract (Main sole config/deployment writer): VISEPANDA_QA_AGENT=true,
VISEPANDA_QA_AGENT_ORIGIN=https://qatesting.go2china.space,
VISEPANDA_QA_AGENT_POLICY_ID=existing immutable policy UUID,
VISEPANDA_QA_AGENT_CONTEXT_MODE=current_input_v1 or qa_session_history_v1;
NEXT_PUBLIC_SUPABASE_URL pinned Staging project, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
Production is refused. Local requires loopback origin AND loopback database, no VERCEL_ENV.

QA Session mode invokes protected qa_read_policy_v1 / qa_accept_policy_v1,
qa_read_session_v1 and qa_submit_message_v1. The immutable new policy must grant
qa_session_history_v1 with matching notice/recipient/region/consent. Ordinary
why/simplify/second/correction text stays on the original canonical ServiceTask.
The SQL wrapper selects the persisted original parent on retry; request identity
and bytes survive lost ACK and later turns. No client parent or model is accepted.

SQL qualifies up to eight total turns/seven prior pairs/64 KiB history; the context
composer validates the full chain and sends the most recent three whole pairs under
its 16 KiB content / 32 KiB prompt caps. Legacy task_history_v1 semantics stay native
and unchanged; QA no longer references the discarded metadata-only task-basis RPC.

createQaWorker is a callable component of the original dedicated hosted worker.
It refuses all VERCEL_ENV values, binds existing secure credentials separately to
fixed Staging DB and the selected supported provider endpoint, uses original work
leases and budget attempts, records validated usage before settlement, and saves
original output only after settlement. The original leaseToken is the attempt ID.
Unknown dispatch/settlement/completion ACK never creates an automatic extra send.

Original hosted-loop/CLI/stop switch/private journal remain the execution host.
Closed v3 profile supports only qa_session_history_v1 and planning:null; v1/v2 retain
their old modes. Exact shared hosted worker and read-only usage auditor candidates
are under hosted-worker-candidate, with before/after SHA pins; Main alone applies them.
The candidate auditor accepts versioned QA jobs and validates original usage/actual
micros without a settlement or provider capability.

Target worker/provider/policy/budget readiness and actual browser/DB/provider
acceptance remain UNRUN until Main connects the original host and QA deployment.

Additive qa-agent/1 capacity contract: policy.maxTurns is `8` only when the protected
qa_read_policy_v1 supplies contextMode=qa_session_history_v1 AND maxTurns=8; missing,
non-numeric or non-8 values fail closed. Legacy current_input_v1 returns maxTurns:null.
Client/deployment flags never create this limit. The ninth new submission returns
HTTP409 `{version:"qa-agent/1",error:{code:"QA_CONTEXT_LIMIT",ack:"not_submitted"}}`.
This is capacity exhaustion, not consent withdrawal: retain the selected Session and
its saved messages, and keep history/message reads available. No new admission,
provider attempt or billing follows this original SQL denial. Existing DATA_POLICY_BLOCKED
still denotes actual policy/permission refusal and retains its 403 semantics.

Read-snapshot conflicts use the existing retryable PROVIDER_UNAVAILABLE/HTTP503
wire, not DATA_POLICY_BLOCKED. A concurrent same-account tab can append a Turn
between metadata and protected text reads. The server shares one extra actor-scoped
metadata read with completion races and performs at most one extra protected text
read if membership/count still differs (at most two of each per request).
Persistent mismatch returns no partial history, and actual protected policy/Session/
UUID/envelope failures remain permission refusals. Normal aligned reads add no work.
A conflict detected before admission has ack:not_submitted; no new Turn/budget or
provider call occurs. Clients retain their selected Session and use the existing
bounded retry for PROVIDER_UNAVAILABLE/503 rather than clearing saved history.

The same protected reread budget also covers a state/content race after membership
refresh: completed/proposal_ready metadata with an earlier pending/null text projection
triggers one protected reread even when the Turn set already matches. The newer saved
answer is then shown only with qualified terminal metadata. If the bounded reread
confirms an empty completed result, the existing terminal technical_failure/null
projection remains; failed/cancelled/unavailable results and stored failure reasons
are not retried indefinitely. Pending metadata plus non-null output still fails closed.
Protected message `kind` must be exactly `text`; missing or other kinds are refused.

Additive qa-agent/1 recovery projection: message.status may be
`reconciliation_required` with `text:null`, preserving original requestId/turnId/Session.
It is emitted only when the trusted qa_read_session_v1 message has
`reconciliationRequired:true` and original output/outcome are both null. That protected
field is mandatory boolean in QA mode; missing/wrong types or true with stored output/
outcome fail closed. Legacy current-input reads may omit it and retain false behavior.
Provider output outcomes are unchanged; the new status is not a model-generated answer.

The SQL owner qualifies unknown work or expired dispatch through the original durable
receipt/nonreleased budget and actor/policy guards. The service never infers the flag
from time, client JSON or a null answer. Original Turn/ledger state is not changed.
GET detail/message still perform reads only; no reserve, release, provider retry or
new request UUID is generated. The status does not assert the provider did nothing,
that cost is zero, or that resending is safe. UI should keep the original Session and
request identity, show the need for reconciliation and not automatically send again.

Existing bounded snapshot reconciliation applies: if metadata is now completed while
an earlier protected recovery projection is null, one protected reread can reveal the
new actual answer with flag:false. A single protected row true+nonnull is inconsistent
and is refused rather than relabeled answered. Actual pending and terminal failure
remain distinguishable when the protected flag is false.
