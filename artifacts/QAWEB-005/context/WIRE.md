# #682 QA Session context integration

Base: daa7bae44a660381fb3295d0d2afc327ea98d3ba. This owner changes only new
`lib/server/qa-agent-context/**`, exclusive tests and this artifact directory.
Main's accepted path is the NEW `qa_session_history_v1` policy and `qa-context/1`
producer owned by the SQL writer. Legacy task_history/worker SQL candidates were
withdrawn before any commit; existing SQL, worker, budget, preview and gateway files remain unchanged.

## Consumer and executor adapter

`createQaContextInvoker()` in `executor-adapter.ts` supplies the backend executor's
`invokeContext` dependency directly. Its structural `QaExecutorContextInput` matches
`qa-agent/executor.ts`'s `QaContextInvocation`. Optional `recordManifest` receives
only source IDs/content fingerprints/counts, never raw source text. No new store.

```ts
import { createQaContextInvoker } from "../qa-agent-context/executor-adapter.ts";
// Existing executeQaWork dependencies:
const invokeContext = createQaContextInvoker({ recordManifest });
```

`assembleQaSessionContext(binding, raw)` accepts exactly:
`kind=qa_input, schemaVersion=qa-context/1, contextMode=qa_session_history_v1,
ownerId, authSessionId, turnId, threadId, serviceTaskId, policyId, consentId,
provider, endpoint, text, locale, history, sourceTurnIds, contextDigest`.
History items have exactly `{turnId,role,content}`; chronological user/assistant pairs.
`sourceTurnIds` is the original producer's reverse chain: current Turn first, root last.
All IDs are original persisted Turn/Task/thread/auth-session/consent IDs.
No fabricated assistant message UUID. `(turnId,role)` identifies each text source;
`contentVersion=SHA256(UTF8 text)` is a fingerprint, not a database revision.
`projectionOrdinal` is ordering within the selected prompt, not a persisted event sequence.

Binding derives from the authenticated original lease owner, fresh QA read and internal
provider configuration. `sessionId` means original `chat_threads.id`; `authSessionId`
is the separate original work/auth session. Each protected `qa_read_work_v1` rereads
current owner/session/consent/policy/visibility/chain under the original QA lease;
consumer independently checks every returned scope value and ID/order/role/shape.
There is no caller actor/ready flag or cached identity callback. Missing fresh identity
fields deny. Main froze the added `ownerId` and `authSessionId` fields on 2026-10-13;
SQL candidate must emit them before this consumer can run.

## Permission, window and provider mapping

Permission can cover up to seven prior pairs/eight total Turns/64 KiB serialized
upstream history. Consumer validates the ENTIRE bounded upstream envelope, including
omitted ancestors, then sends only the most recent THREE complete pairs plus current input.
It records upstreamPairs and selectedPairs explicitly. It does not claim to send all seven.
A fresh Session sends zero prior messages; foreign/missing/duplicate/unknown sources deny.
Per user message cap 4000 UTF16 units; assistant 8000; selected content <=16384 UTF8 bytes;
serialized prompt <=32768 bytes. Byte count is a conservative token bound, not actual usage.
An oversized recent message denies the whole call; no truncation or fallback to older text.
Latest corrections remain exact and last; no Memory or Trip mutation is inferred.

`invokeQaSessionContext` uses the original `invokeTextProviderProtocol` serializer,
model selection, output parser and CostGuard. Its internal `task_input` / `task_history_v1`
shape selects the existing three-pair serializer ONLY; it never calls legacy SQL history
read/dispatch and cannot upgrade an old policy. External reads/authorization are strictly:

1. `qa_read_work_v1({p_turn_id,p_lease_token})`, validate and project.
2. Before dispatch, repeat the protected read; exact source fingerprint and contextDigest
   must still match, including the complete permitted upstream chain.
3. Optional content-free manifest observation finishes before final permission.
4. `qa_authorize_dispatch_v1({p_turn_id,p_lease_token,p_scope_id,p_policy_id,p_provider,p_context_digest})`.
5. Only actual `{kind:authorized}` reaches the existing provider transport.

The same deadline covers the initial protected read, recheck, observation, SQL authorization
and provider call. Cancellation and late ignored promises cannot start a later fetch.
No retry/fallback/new task/queue/ledger is created here. SQL authorization performs the
original durable dispatch atomically. The backend reserves first with `attempt_id=leaseToken`
and `task_id=turnId` (SQL canonicalizes ServiceTask), then settles and completes normally.
Do not pre-dispatch via `runWithDurableBudget`; its eager dispatch would conflict with QA's
reserved-ledger authorization. The backend's dedicated executor already follows this order.

## Prompt shared candidate

The consumer currently uses existing `TEXT_TASK_SYSTEM_PROMPT`, which already describes
explicitly consented three-pair same-goal history and untrusted prior messages. The sole
remaining prompt clarification candidate is in `shared-candidate/prompt.{before.txt,patch,after.txt}`:
explicitly name followups/alternatives/simplification/latest corrections and bump the task prompt
reference. It does not alter authorization. Main must coordinate the prompt holder; no shared file
was written. The former legacy SQL/admission/worker modification alternatives are NOT part of delivery.

## Evidence limits and target record

Synthetic consumer/protocol tests establish shape, scope, ordering, caps, latest-input projection,
source/actor changes and denied-read behavior. They do not independently prove SQL expiration,
withdrawal or actor RLS; the SQL owner supplies those tests. They do not prove answer semantic quality.
Main target acceptance records tested SHA, exact manifest/contextDigest, provider/model, actual
reported input/output tokens, outcome and latency for why/simplify/second-option/correction,
new Session isolation, refused/timeout/changed actor/source cases. Target remains UNRUN here.
