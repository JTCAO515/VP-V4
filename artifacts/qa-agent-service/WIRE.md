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
VISEPANDA_QA_AGENT_CONTEXT_MODE=current_input_v1 or task_history_v1;
NEXT_PUBLIC_SUPABASE_URL pinned Staging project, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
Production is refused. Local requires loopback origin AND loopback database, no VERCEL_ENV.

Task mode invokes original read_text_task_policy and submit_service_task_turn with
server-derived original task/parent relation. The new protected metadata RPC candidate
in task-basis-candidate.sql is NOT APPLIED; Main must review/install it. Original task mode
allows first new_goal then clarification/repair only, with SQL authorization before provider
sends at most three pairs. Ordinary answered-after-answered follow-up is not claimed.

This service uses original queue; the existing dedicated hosted worker executes actual
provider protocol, budget attempts, pricing and atomic saved output. It does not execute
on Vercel. Target worker/provider/policy/budget readiness and actual browser/DB/provider
acceptance remain UNRUN until Main connects the original worker and target deployment.
