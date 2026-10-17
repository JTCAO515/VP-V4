# P0 SQL dependency analysis — review input, not an apply list

Reference QA: `c0ef6edefcc2ac63ed665d14305cca1ad541504f`; its migrations match
the original `5e960e6d` snapshot. Main's supplied fresh inventory is 75 applied,
161 source, 86 missing, target-only0. No DB query was repeated. The new runtime
binding migration from 5b82f716 is additional to that frozen comparison.
History membership is not proof of current object bodies, role attributes,
policy/budget rows or runtime success. No 86-migration deployment is proposed.

## Functional closure for first answer, persist and reopen

| Port / path | SQL and origin | History status |
| --- | --- | --- |
| Cookie claims, protected actor/session | auth.users/sessions; identity_private.mobile_access_v2/guard_mobile_rpc_v2, `20260909223841_vpj_04_native_mobile_sessions` | applied; no real GoTrue test here |
| List/create/read original Session | chat_threads/chat_turn_events/chat_turn_idempotency (`20260828153000_v4_08_durable_chat_threads`); turns base; turn_feedback (`20260828160000_v4_09_chat_feedback`); memory_consumer_receipts (`20260828194000_v4_15_memory_consumer_receipts`) | applied; adapter getChatThread reads feedback/receipts even for QA, so these are real read dependencies |
| Original durable work/text | `20260910163426_vpj_07_durable_turn_work`, `20260910171836_vpj_07_text_authorization`, `20260910174748_vpj_07_native_text_consumer` | applied; lock_turn, terminal, work, text_owner/policy/current/consent/content/dispatch, start_text_turn, read_text_policy/read_text_turn |
| Same Task and canonical budget identity | `20260911200339_vpj_07_service_task_records`, `20260911205200_vpj_07_task_context`; qualified text locks/read corrections in `20260912190000_vpj_16_grounded_turn` | applied; do not recreate queue/Task/budget authority |
| Original model budget | `20260909184816_vpj_59_durable_model_budget` plus Task-aware reserve override above | applied; reserve_model_budget/dispatch_model_budget/finish_model_budget and scopes/provider limits/attempts |
| Actual disabled-first host | `20260923090000_vpj_07_hosted_text_worker` | applied; read_hosted_worker_status, hosted_worker_heartbeat/control; live ability UNKNOWN |
| QA policy/consent, list/read/reopen, submit/worker | `20261013050429_qa_agent_web` | missing; actual direct new producer |
| Approved deployment actor | `20261016040522_qa_runtime_binding` in repair5b82f716 | new candidate only; v3 discovery/v2 dispatch; depends on unchanged QA v1 and original budget/policy authority |

Actual QA browser RPCs: qa_read_policy_v1, qa_accept_policy_v1,
qa_list_sessions_v1, qa_read_session_v1, qa_submit_message_v1, read_text_turn.
Actual QA worker RPCs: qa_ready_groups_v3, qa_claim_work_v1, qa_read_work_v1,
qa_authorize_dispatch_v2 (delegates original v1), qa_complete_work_v1, original
budget reserve/finish. The context consumer rereads original protected QA work
and authorizes through that adapter. `qa_session_history_v1` is a mode, not a
missing public RPC; `qa_task_history_v1` is not used in this path.

Persistence is original text_content output + terminal Turn/event; reopen uses
the exact original owner/Session and protected readback. No result-library,
Trip proposal, iOS goal-return or cancellation RPC is on this minimal success path.

## Why the current QA file cannot simply be applied alone

Functional closure is smaller than the **installation closure of the existing
monolithic migration**. The QA transaction at lines6–10 requires exact claim/
lock function hashes and two CHECK definitions. Lines498–501 also require exact
predecessor definitions of Turn/Profile/Result lifecycle gates; the same
transaction replaces those gates and retains broad relation/function/trigger
fingerprints. Missing prerequisites abort the transaction; do not remove checks.

| Required existing QA pre-pin | Authored predecessor chain relevant to its expected body |
| --- | --- |
| claim_turn_work md5 18f9e80f8fbad1d1bb50f0f4fb22273c | latest pre-QA explicit replacement `20261010020000_assistant_events:1667` (missing); also creates cancel_unclaimable_turn_v1 at1636, called by final QA claim, so this is a real indirect function dependency |
| lock_text_work md5 6784eb5b499638a9692adb2ad5037719 | latest explicit pre-QA body `20260912190000_vpj_16_grounded_turn:286` (applied history) |
| require_text_task md5 95fb74d25934ea29de80eeb3fdc640fd | grounded_turn:369 (applied history); QA extends this existing trigger, not a new Task registry |
| turn_data schema hash 81eab8c4cdb31f2fd9289af2b5b4b63d | `20261007050000_turn_data` → `20261010020000_assistant_events` → `20261010030000_vpj09_travel_directions:3639` (all missing) |
| profile schema hash af41a55b4b5eb9c89d19f96fb27720c5 | `20261007020000_profile_data` → `20261007040000_profile_core_export` → turn_data → assistant_events → travel_directions:3568 (missing) |
| result schema hash 9f419ac01a94ce6cb8a351cb37f29cb9 | `20261007010000_result_data` → profile_data → profile_core_export → turn_data → assistant_events → travel_directions:3630 (missing) |
| turn_data runtime hash 9ae302a02415fe2d7aa22d39350d56ed | turn_data → assistant_events → travel_directions → `20261010040000_vpj09_retained_turn_export:129` (missing) |

Those lifecycle functions inspect ConversationData, core export, readiness,
recovery, scoped-edit, service/brief and other existing module shapes/pins.
Their complete transitive requirements cannot be replaced with “only these
eight filenames” or inferred from directory order. Travel pace's native_original_v1
is a rename in profile_data:104, not a missing new function to fabricate.

`p0-sql-source-inventory.json` records all 321 qualified references in the QA
file, declaration history/line evidence, applied version membership and a
classification for every missing86 entry. It intentionally includes literal
lifecycle manifests; it is lexical evidence, not a full SQL semantic resolver.
58 declaration versions through QA are referenced by that file, including
applied ones. Dynamic ALTER/RENAME/EXECUTE, triggers, RLS, exact catalog hashes
and transitive dependencies still require review. Never execute this inventory
as a deployment script or call it a proven minimal installation sequence.

## Non-P0 and uncertain portions of missing86

The six migrations after QA (`20261015024450` iOS goal-return,
`20261015040456` resolved-subject context, `20261015043710` cancellation,
`20261015055708` Trip ServiceTask settlement, `20261015083120` canonical place Ask,
`20261015161024` online address) are not predecessors of the original QA
first-answer/persist/reopen path. They remain accepted product source; exclusion
from this functional path is not authority to remove or overwrite them.

StoreKit, Trip confirmation/proposal, planner comparison, archive/export,
community and many other missing features are not direct browser/worker calls
for this success path. Some **are nevertheless indirect installation/schema-pin
dependencies** of the current QA transaction. Their optional status for live
installation remains unproven. The JSON labels this distinction per file;
it does not mark unproven rows safe to skip.

## Smallest decision still needed from Main

Review a bounded install plan against actual catalogue/source pins, especially
the four lifecycle gate preimages and current source trigger/ACL state. A clone
or equivalent permitted local proof should validate the exact selected closure,
not merely replay all86 and assert they are all necessary. Current repair's
full161+new SQL PG PASS proves compatibility only, not minimality or target state.
If a smaller installation cannot satisfy the unchanged current QA transaction,
record that exact conflict for Main's source/architecture decision; do not edit
old migrations, waive guards, add broad grants or open the switch.

Once ports are available, policy/consent/provider config/exact budget scope and
the reviewed actor tuple are separate data/operation prerequisites. None is
created by this analysis, and existing login or a healthy target does not prove
these values. Real target apply/provider/host/start remain STOP.
