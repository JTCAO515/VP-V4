# Frozen qa-agent/1 browser wire

All responses include `version: "qa-agent/1"`; private/no-store, Cookie/Origin vary.
Cookie SSR identity only. POST requires exact same Origin and application/json;
Authorization, cross-site and query parameters rejected. No client model/history/Trip fields.

- GET `/api/qa-agent/sessions`: 200 `{sessions:[{id,label,createdAt,updatedAt}]}`.
- POST same path `{}`: 201 `{session:{id,label,createdAt,updatedAt}}`. Original chat_threads ID; label is truthful generic `Session` metadata. No Trip.
- GET `/api/qa-agent/sessions/:sessionId`: 200 `{session,messages,historyLimit:20,policy}`; newest 20 original protected turns in chronological order.
- POST `/api/qa-agent/sessions/:sessionId/messages` `{requestId:UUID,text:string}`: 202 `{requestId,turnId,sessionId,status:"pending",reused:boolean}`. requestId equals original turn/idempotency ID. Accepted does not mean answered.
- GET `/api/qa-agent/sessions/:sessionId/messages/:requestId`: 200 `{message:{requestId,turnId,sessionId,input,text,status,createdAt}}`. `text` is saved original output or null. Status pending/answered/partial/clarification/blocked/technical_failure. Refresh/retry poll the same original ID.
- GET `/api/qa-agent/policy`: 200 `{policy:{id,noticeHash,noticeZh,noticeEn,provider,recipient,consentState,contextMode}}`.
- POST `/api/qa-agent/consent` `{policyId,noticeHash}`: 200 same policy envelope, server reads immutable notice/consent. UI must show notice and await explicit acceptance before calling; no implied consent.

Errors `{version,error:{code,ack}}`: INVALID_INPUT 400; UNAUTHENTICATED 401;
FORBIDDEN 403; DATA_POLICY_BLOCKED 403; IDEMPOTENCY_KEY_REUSE 409;
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
