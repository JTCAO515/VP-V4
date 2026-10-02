# Exact intake → planning admission bridge v2 proposal

Preparation only, 2026-10-03. Base `80fa7862060f9549e0665a2c818667f4955fd3a1`; intake snapshot `05c0042c590b79ce41b6f8141799e64b34334e84` plus `4728c18f96d60138cbc6718fc31f5f10ae3ad20b`. No runtime SQL, helper or migration implemented. #561 is the candidate bridge writer; Main/#559 must confirm private intake-helper ownership. #560 alone owns qualified result projection/validator and publisher SQL. Applied intake migration 200000 remains unchanged.

## Existing signature and actual failure

Existing `public.submit_planning_comparison_v1(p_conversation_id uuid,p_goal_id uuid,p_expected_goal_version integer,p_parent_message_id uuid,p_message_id uuid,p_message_key uuid,p_thread_id uuid,p_turn_id uuid,p_task_id uuid,p_task_key uuid,p_text_policy_id uuid,p_planning_policy_id uuid,p_locale text,p_text text,p_memory_basis jsonb) returns jsonb` is ordinary-auth initial new-Task admission. It adds a new same-goal assistant message but no typed intake row. The fixed helper `turn_private.assistant_travel_current_basis_v1(owner,source)` requires both latest intake revision and latest same-goal message, so the old source becomes unavailable (`stale_basis`) immediately after successful planning admission. Keeping/reusing its digest is forbidden.

The standalone preparation test loads only existing runtime migrations plus the fixed intake SQL into a network-none disposable PostgreSQL. It establishes this result with actual authenticated RPCs and separately exercises duplicate-key races, planning/correction races and late-CAS rollback. It does not install a candidate bridge or pretend future negatives are already proven.

## New public signature

Candidate `public.submit_planning_comparison_v2` retains all fifteen v1 parameters, plus:

- `p_expected_intake_message_id uuid`: exact original qualified source; must equal `p_parent_message_id`.
- `p_expected_intake_revision integer`: 1–999 with a free next immutable revision.
- `p_expected_intake_digest text`: exact lower SHA-256 from a current authorized intake read, not a planning digest.
- `p_intake jsonb`: complete explicit projection, exactly JSONB-equal to the current source's validated intake (including null versus []).

`p_memory_basis` remains the explicit exact selected ID/revision set. Validate the frozen schema and Memory helper; compare normalized UUID/revision tuples in stable UUID order with the original stored refs. No extra/missing ref, changed revision, inferred prose change or digest substitution. Changed values require ordinary explicit correction first. Initial new-Task/Turn semantics, existing capacity admission and no unknown retry remain unchanged. This v2 is an opt-in bridge; v1 keeps its existing contract.

The bridge admits only the current supported `ready/transport_screening` projection. Missing required city/target is waiting-user at the intake seam, and unsupported city/budget filter stays unavailable. Lodging budget null is valid for transport screening. The bridge must not change `readyForProvider:false` from an intake preview into permission to dispatch.

## Atomic receipt and source version semantics

Success's stable receipt: `{kind:"accepted",reused,taskId,turnId,artifactId,conversationId,goalId,goalVersion,messageId,messageSequence,intakeRevision}`. Append authority fields only when still current: `{current:true,intakeContextDigest:<new source digest>,readyForProvider:false}`. The exact new intake digest is distinct from the original expected digest. Replay of the identical request returns the same Task/Turn/artifact/new typed-source identity and creates no rows. Changed request under the same immutable key returns `IDEMPOTENCY_KEY_REUSE`. If a later correction/revocation makes it stale, do not expose a historical digest as current: return the stable receipt with `current:false` and omit current basis/digests (or reject revoked authority under the existing policy). Main must freeze that stale replay shape before implementation.

The same transaction checks original current source/projection/Memory/CAS **before creating the new assistant message**, then inserts an immutable typed intake row bound to that message. Goal version stays unchanged because delegation is a follow-up, not amendment; messageSequence becomes the actual newly allocated sequence; intakeRevision advances by exactly one. The new binding repeats explicitly supplied values, not parsed text/history. Recompute the qualified digest against the new latest message/revision; null means rollback. Store old identity/digest only as private audit/input, never qualified output. No update/revival of old rows.

Worker read: candidate `public.read_planning_comparison_work_v2(p_turn_id uuid,p_lease_token uuid) returns jsonb` preserves exact active lease/owner/session/policies/basis. It adds `qualifiedIntake` in the frozen `assistant-travel-current-basis/1` public shape (version5, false readiness flag) and a separately named `intakeContextDigest`. Its existing planning context digest is named `planningContextDigest`, computed over the complete current planning payload including qualified binding; no bare `contextDigest` is used to ambiguously mean both. It must not call the authenticated intake RPC by impersonating an actor: use a reviewed private helper. #561 owns this worker-read bridge only after Main approval.

Dispatch/checkpoint/publication must recheck current **both** authorities. A current lease with stale typed source, or valid intake digest with stale planning/action context, is blocked. #560 publisher consumes the exact new binding and validated observation and retains current lease/actions/settlement/atomic artifact/outbox checks. The old planning read/claim/receipt paths remain untouched unless Main approves the minimal function delta.

## Locks — proposed position, not approval

Existing planning admission: planning-consent SHARE → owner capacity advisory `(owner,34)` → text-consent SHARE → sorted service-task identity advisories (Task/Turn UUID pair) → thread/task/text admission locks → assistant-message idempotency advisory → conversation UPDATE → goal UPDATE → action/basis checks. Existing typed writer: text-consent SHARE → assistant-message idempotency advisory → conversation UPDATE → goal UPDATE → Memory profile SHARE (sorted IDs) → Memory consent SHARE. Ordinary goal-message writer uses the same message/conversation/goal order; Memory writers use profile before consent.

**Forbidden wrapper order:** conversation/goal first, then nested old Task admission. A legacy planning transaction can hold owner capacity while waiting for conversation; the wrapper would hold conversation while waiting for capacity.

Candidate safe staging order for review:

1. Validate input, owner/session and current policy/consent; acquire planning consent in the existing order.
2. Stage the existing `submit_service_task_turn(...,'new_goal',null)` inside this same transaction. This acquires existing capacity/Task identity/thread/account/Turn locks and creates only uncommitted Task/Turn/work rows. No message, worker-visible work, external effect or paid attempt exists yet. This is provisional admission, not authorization. Failure of any later check rolls these rows/capacity back.
3. Acquire the existing assistant-message idempotency advisory for `p_message_key`, then conversation/goal UPDATE. Check exact goal version, latest parent, intake message/revision and current digest/projection; only then acquire Memory profile→consent via the existing helper. No current-basis helper that takes Memory locks is called before stage 2.
4. Call the existing planning admission with identical staged Task keys (service-task admission reentrant/reused), so new message/planning row are written under already held locks. Its input request must exactly match stage 2. It acquires no reversed conversation→new capacity lock because capacity/Task/thread/Turn locks are already held.
5. An approved **new** private helper inserts the immutable intake row/new revision for the new message and returns its new qualified digest. Insert bridge receipt/binding with distinct input/new source identities and whole request digest. Recompute current basis and reject null; all writes commit together.

Step 2 before source qualification is intentionally visible only inside the transaction, and must be accepted by Main/#559; it satisfies source validation before new-message creation without inverting legacy locks. Alternative: duplicate the admission logic under a predeclared lock order, but that expands maintenance and is not proposed as a silent choice. Never lock an already existing thread after conversation without the stage-2 locks. Concurrent idempotency keys, duplicate Task IDs, mixed legacy/v2 and typed corrections require controlled wait/deadlock tests. Existing cancellation/grants/Memory withdrawal retain their lock prefixes; do not add a lock in the opposite order.

Proposed private helpers, only if Main/#559 assign them to #561: `turn_private.bind_planning_travel_intake_v1(owner uuid,new_message uuid,expected_source uuid,expected_revision integer,expected_digest text,intake jsonb,memory_basis jsonb,request_key uuid,request_digest text) returns jsonb` and `turn_private.read_planning_qualified_intake_v1(owner uuid,turn uuid,lease uuid) returns jsonb`. No public/anon/authenticated/service_role grants; execute only through reviewed SECURITY DEFINER wrappers. Do not change existing helper bodies or migration 200000. Helper/table layout and append-only migration number are intentionally unallocated pending ownership approval.

## Failure / rollback matrix

Required future bridge tests (NOT yet PASS): foreign owner/session; revoked text/planning/Memory consent; null/wrong schema; missing/extra projection fields; null versus []; wrong historical digest/new planning digest substituted; old intake identity/revision; stale latest message/goal; changed values/Memory refs; revision1000; reused key/different payload; duplicate Task/thread/Turn IDs; two admissions with different keys against one source; exact same-key races; admission versus explicit correction in both controlled lock orders; Memory update/withdrawal while binding; failure after Task stage, after new message, after new intake insert and before receipt. Every failure must leave goal/text/sequence/messages/intakes/Task/Turn/work/capacity/binding/receipt unchanged, and paid attempts zero. A successful race has one complete current source, never a half-bound message.

Prepared baseline probes are executable now; they are regression inputs for later v2 tests, not substitutes for them. No provider, HTTP actor impersonation, target migration/deployment, fees or full #561 producer completion is claimed.
