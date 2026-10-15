# qa-cancellation/1

Public browser-safe contract: lib/qa-agent/cancellation-contract.ts.

GET/POST /api/qa-agent/sessions/:sessionId/messages/:requestId/cancellation.
POST requires exact JSON {}, Cookie identity, same Origin, approved QA target.
No ownerId, turnId, policy, provider, new Task or generated request UUID is accepted.
GET needs no new generation consent/credit/enable flag and returns metadata only.

Receipt exactly {version:"qa-cancellation/1",sessionId,requestId,state,ack}:

| state | ack | Meaning |
| --- | --- | --- |
| pending | unknown | Original canonical request is observed active; not a certified stop |
| cancelled | observed | Original Turn + cancellation event prove cancellation |
| terminal | observed | Already terminal; stored result/Trip are not reversed |
| not_observed | unknown | No matching original request observed in this owner Session; not proof of non-admission/consumption |

GET returns 200 for a valid receipt. POST returns 200 for observed terminal/cancelled,
202 for pending/not_observed. Unknown RPC/network/ACK gives HTTP503 with scoped
{version,sessionId,requestId,error:{code:"PROVIDER_UNAVAILABLE",ack:"unknown"}}.
Error codes INVALID_INPUT 400, UNAUTHENTICATED 401, FORBIDDEN 403 otherwise.
not_submitted concerns THIS cancellation attempt only; original message identity
must be retained. Recover by GET for the same original IDs, never automatic POST,
new admission/UUID, rollback, refund or a claim that provider work never occurred.
No question/answer/source body or new cancellation store is returned/retained.

qa-agent/1 status/history remain unchanged, including neutral cancelled/null failure
projection. Consumers use this independent original-request receipt to identify a stop.

SQL: public.qa_cancellation_v1(text,uuid,uuid), p_action=read|cancel;
new append supabase/migrations/20261015043710_agent001_qa_cancellation.sql allocated
and granted by Main after an empty-file before state. Authenticated EXECUTE only;
anon/PUBLIC/service_role denied. Owner postgres, SECURITY DEFINER, empty search_path.
No private helper or table grants. All existing function/table/sequence ACL, RLS and
function source checks are unchanged in isolated PG proof. Main owns global ACL
expected-list registration, target order and actual managed database apply.

It derives original request -> Turn from owner/session idempotency and exact private
QA Task/text/policy-mode membership; it does not accept client Turn/owner proof.
It calls the unmodified mobile/session guard and verifies live auth.users/auth.sessions
without text_owner's account-registration INSERT, so GET does not enroll anything.
POST then reuses original cancel_chat_turn with its capacity/row-lock/event semantics.
Generation policy/consent withdrawal is not a reason to reenroll before stopping.
No model-budget settlement/release or Trip mutation is added; unknown costs survive.
