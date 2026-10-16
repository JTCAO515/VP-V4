# P0 SQL dependency analysis — review input, not an apply list

Current reference QA: `4abeeb41e87f2ac36f0efdb9ba94780ce0049a13` (PR731 merged).
Source now has **162** migrations; reusing Main's original **75 applied** version
metadata yields **87 missing, target-only0**. Source comparison proves the only
new migration since the original161 snapshot is `20261016040522_qa_runtime_binding.sql`;
all original missing86 file hashes still match. This is a source-derived update,
not a new target query. Main's existing metadata file still labels source5e960e6d/
161/86; its SHA256 and the exact derivation are in `p0-sql-closure-4abe.json`.
The older `p0-sql-source-inventory.json` remains a dated161/86 lexical snapshot.

History membership or a catalogue name is not proof of current object bodies,
role attributes/ACL/RLS, policy/budget rows or runtime success. No87-migration
apply is proposed or authorized. Current recovery authority is A–D only, **no E**;
this analysis performs no target SQL/upgrade, clone, new fixture identity,
account/user-row/key read, provider call, fee or switch enablement.

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
| Approved deployment actor | `20261016040522_qa_runtime_binding` (now merged in QA4abe / PR731) | version absent from original75; actual target wrapper catalogue/body/ACL UNKNOWN; v3 discovery/v2 dispatch depend on original QA/table/budget/policy authority |

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

## Non-P0 and uncertain portions of the original missing86

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
the four lifecycle gate preimages and current source trigger/ACL state. The exact selected closure still needs compatibility evidence under a separately
valid future authorization. Current A–D/no-E authority permits no upgrade or clone
execution here. Historical full161+new SQL PG PASS proves compatibility only,
not minimality or target state; no matrix is rerun for this source-only update.
If a smaller installation cannot satisfy the unchanged current QA transaction,
record that exact conflict for Main's source/architecture decision; do not edit
old migrations, waive guards, add broad grants or open the switch.

Once ports are available, policy/consent/provider config/exact budget scope and
the reviewed actor tuple are separate data/operation prerequisites. None is
created by this analysis, and existing login or a healthy target does not prove
these values. Real target apply/provider/host/start remain STOP.


## PR731 wrappers: exact source dependencies and permissions

- `20261016040522_qa_runtime_binding.sql:3–41`: v3 discovery directly reads
  `turn_private.hosted_worker_control/work/text_content/text_policies/text_consents`
  and `public.model_budget_scopes/model_budget_provider_limits/model_budget_attempts`.
  It **does not call qa_ready_groups_v2 or v1**. It retains their original eligibility,
  excludes unresolved attempts/dispatch, filters owner/policy/real notice before
  LIMIT, and requires exactly one model/price-matching scope with the approved ID.
  A missing/false switch returns disabled, not a qualified actor.
- Lines43–58: v2 dispatch first calls original `qa_read_work_v1(turn,lease)`.
  That port locks/checks original lease/actor/session/history/policy/consent through
  `qa_lock_work_v1/qa_history_v1/lock_turn/text_policy_current`. Wrapper compares
  returned owner/policy to the independently approved tuple, locks the real
  `text_policies.notice_hash` row and checks scope's actual owner. Then it calls
  **unchanged qa_authorize_dispatch_v1** with original scope/policy/provider/digest.
  v1 checks canonical ServiceTask/budget reservation, performs original
  dispatch_model_budget, rereads protected work and rolls back dispatch if source
  expired; the wrapper neither reserves twice nor bypasses that authorization.
- Lines60–65 source ownership/ACL: both new functions are postgres-owned SECURITY
  DEFINER with empty search_path. EXECUTE is removed from PUBLIC/anon/authenticated/
  service_role, then granted only to service_role. This does **not** rewrite old
  function ACL or any table/RLS permission. Original QA migration:449–453 separately
  grants browser policy/submit/read RPCs to authenticated and worker read/claim/
  authorize/complete to service_role; private helpers have no ordinary-role execute.
  Calling v2 as service_role does not repair a missing/wrong old function owner,
  changed body or ACL. Actual target ownership/privileges remain UNKNOWN.
- Original notice authority is `turn_private.text_policies.notice_hash`; its
  immutable_text_policy trigger permits revocation changes, not replacing notice.
  Existing qa_accept_policy_v1/read_policy route and original consent records bind
  notice and actor. A hash passed in a package/discovery result does not itself
  establish actual policy acceptance or current terms/region/expiry.

Minimum **functional** graph, independent of installation side effects:

```text
existing GoTrue Cookie claims → auth.users/sessions + original actor guard/RLS
  → original chat_threads/turns/events/feedback/memory receipt reads
  → QA policy/hash + actual consent → stable Session/Task/Turn submit
  → original work queue → disabled-first status/heartbeat
  → trusted target/2 → runtime-binding/1
  → v3 qualified exact tuple/model/price scope before LIMIT
  → original QA claim/read + original reserve_model_budget
  → bounded QA context reread → wrapper dispatch v2 → original authorize v1
  → original budget dispatch + exact provider binding (no call in this analysis)
  → validated usage → original finish_model_budget → QA completion
  → original persisted text/Turn/event → same actor/Session protected reopen
```

Actual owner/policy/scope/notice/configuration/provider/terms facts are separate
row/config prerequisites, not migration versions. No row is created or guessed;
no authority is inferred from discovery or Auth login alone. Wrong/expired consent,
ambiguous/frozen/insufficient budget, absent originals or changed source can still
block this graph even if every named function exists.

## Source-order review list and installation effects (not sufficient to apply)

The paired JSON contains file SHA256s and version-history status. The following
is the **visible gate/preimage chain to review**, not a claim that ten files form
an independently proven minimal or sufficient installation package:

| Source order / version | Cannot ignore in this source review / affected authority |
| --- | --- |
| 20261006060000 ConversationData | QA's retained lifecycle gates call ConversationData schema authority. Its own missing predecessor chain and catalog fingerprints still need closure; not a first-answer UI feature requirement. |
| 20261007010000 ResultData | Base Result lifecycle/infrastructure authority later replaced and pinned by QA; changes exports/erase/source fences beyond QA. |
| 20261007020000 ProfileData | Base Profile gates, renamed original native policy functions and Result integration; broad privacy/profile surface, not just QA. |
| 20261007040000 Profile core export | Authored gate replacement in the required lifecycle preimage chain; core-export objects/hooks are part of its contract. |
| 20261007050000 TurnData | Base Turn schema/runtime, Profile/Result gate integration and source triggers; affects Turn export/erase/runtime eligibility. |
| 20261010020000 Assistant events | Supplies final pre-QA claim body plus cancel_unclaimable_turn_v1, which final QA claim actually calls; also revises lifecycle gates/event sources. |
| 20261010030000 Travel directions | Supplies the precise schema gate preimages checked by QA; direct product feature is not needed for a QA answer, but the unchanged QA transaction references this authored state. |
| 20261010040000 Retained Turn export | Supplies exact Turn runtime gate preimage checked by QA; carries managed export/provenance semantics. |
| 20261013050429 QA producer | One original begin/commit (lines1/778), with CHECK replacements, new QA trigger/helpers/public RPCs, claim_turn_work/lock_text_work/require_text_task revisions and four lifecycle gate revisions. Apply cannot be reduced to extracted public RPCs, nor can the original transaction/source guards be edited. |
| 20261016040522 Runtime binding | One new begin/commit; only new v3/v2 ports and their own owner/execute ACL. No original function, table, switch or registry is changed. Requires usable original v1/table authority at execution, not merely successful CREATE FUNCTION. |

Ordering above comes from authored function/preimage dependencies as well as
versions; it does **not** fill in missing earlier module prerequisites. The old
QA guard hashes table above remains exact. These ordinary PL/pgSQL bodies can
contain deferred references, and plain CREATE OR REPLACE alone does not prove
every earlier migration is indispensable; unknown intermediate requirements
must be resolved by exact source/guard analysis, not inferred from ordering.

Known target limitation is original75 version metadata plus Main's earlier
read-only report that actual qa_ready_groups_v2, qa_claim_work_v1 and
qa_authorize_dispatch_v1 are absent. Other individual RPC/catalog/body/ACL states
have not been newly queried here. Missing new version indicates history absence,
not a proof against manual objects; manually existing names would still need
exact signatures/bodies/ownership/ACL and lifecycle compatibility verification.

The remaining source transitive closure includes dynamic ALTER/RENAME/EXECUTE,
exact function hashes, relations/columns/FKs/triggers, default-ACL history and
schema/runtime inventories. It is **UNKNOWN** whether a smaller whole-migration
subset satisfies all unchanged gates on the original75 target. This is the
specific unresolved dependency for Main's future minimal shared-upgrade package,
not permission to apply all87 or rewrite/extract migrations to evade it. Existing
later six non-P0 predecessor exclusions remain unchanged; the new binding file
is now the explicit additional P0 member, rather than a generic extra feature.

Completion: source-only update and minimal JSON; no SQL/source/CI edits or tests,
no target access or execution. Review list delivered; this task STOP.
