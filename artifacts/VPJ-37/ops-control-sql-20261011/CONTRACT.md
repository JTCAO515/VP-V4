# W2 SQL / runtime review contract

Source base: `4f3c7b322316f3c6be3d505bdeb86b300a1596f4`, fast-forwarded from the
assigned 9ee base on 2026-10-12. #229 AC3; one W2 result. This document is a review
proposal, not an existing RPC, a frozen Main approval, or target acceptance.

## API and identity

One public entry: `public.ops_control_operations_v1(p_input jsonb)`. Use a thin
`SECURITY DEFINER` wrapper owned by postgres, `search_path=''`, that invokes a
private kernel. Default PUBLIC/anon/service_role access is revoked. The sole proposed
ordinary grant is authenticated EXECUTE on this wrapper. No private-schema usage or
EXECUTE grant, table policy, membership, Auth, W1, or knowledge-private grant is added.
This permission closure is part of the full candidate for Main review; it is not a live grant.

Every action first calls unchanged `knowledge_review_private.current_actor()`.
`sessionId` is the current `auth.jwt()->>'session_id'`, validated against actual
`auth.sessions` by that guard. `sessionEpoch` is the decimal string of the actual
`identity_private.mobile_accounts.epoch` locked by the same guard. Web sessions retain
their existing coexistence semantics: no fake mobile enrollment or guessed epoch.
Both fields are response fences, never execution authority. The HTTP adapter checks
its current authenticated actor/session before and after RPC. Every returned receipt
is rendered with the CURRENT session fields, even when its immutable operation predates
that session. No original session UUID is persisted in the operation record.

Closed inputs, no optional keys; UUID strings must be canonical lowercase. Revisions
are JSON integers 0..9007199254740990. No null, free-form reason, actor, target-owner,
provider credentials, task IDs or city override is accepted.

| action | exact input keys beyond schemaVersion=ops-control/1, action |
| --- | --- |
| workspace | none |
| set | operationId, expectedRevision, scope, state |
| receipt | operationId |
| budget_read | scopeId |
| budget_resume | operationId, scopeId, expectedRevision |

`scope` is exactly `{kind,key}`; kind is capability/provider/city. State is
disabled/enabled. All responses have schemaVersion, sessionId, sessionEpoch.

Workspace exact additional keys: revision, observedAt, controls, registry, recoveryReady.
`controls`: sorted array of `{scope,state,revision,stopRevision}`; absent registration
is unavailable, never implicitly enabled. `registry`: exactly capabilities/providers/cities
as sorted arrays of their keys. `recoveryReady` is false unless the restore fence qualifies.
observedAt/appliedAt are UTC `YYYY-MM-DDTHH:MM:SS.ffffffZ`.

Set/receipt exact additional keys: operationId, action='set', scope, state, revision,
stopRevision, appliedAt, acknowledgement='applied', effect. Effect is blocks_new_dispatch
or permits_fresh_authorization. Receipt reads preserve appliedAt/revision/result from
the original mutation. They do not recompute success from current config.

Budget read exact additional keys: action='budget_read', scopeId, revision, stopRevision,
enabled, frozen, expiresAt, exposureMicros, unresolvedAttempts, eligibility.
exposureMicros is a decimal string, never floating point. unresolvedAttempts is the
count of dispatched/pending. Eligibility is one of eligible/not_stopped/unresolved/
expired/exhausted/provider_unavailable/retired/recovery_unavailable. No owner, task,
attempt, model, price identifier or raw ledger content is returned.

Budget resume/its receipt exact additional keys: operationId, action='budget_resume',
scopeId, revision, stopRevision, appliedAt, acknowledgement='applied',
effect='permits_fresh_budget_authorization'. It is distinguishable from a set receipt.
No set-only fields appear. receipt returns this same action union with fresh session fences.

Allowlisted errors: OPS_FORBIDDEN, OPS_CONFLICT, OPS_UNAVAILABLE, OPS_INVALID_INPUT.
Unqualified target/foreign operation must not reveal existence. Raw SQL text never leaves HTTP.

## Registered scope and authoritative source

Code modes are text, planning_comparison_v1, planning_intake_comparison_v2,
scoped_trip_edit_v1. The four capabilities plus four providers and four cities bound controls
to 12 rows. Scoped edit has its own existing paid executor and destination authorization;
its unproven city remains unknown and any active city stop blocks fresh dispatch. Grounded
is text with an existing grounded record, not a fourth mode. Models register qwen/glm/
deepseek; amap is only the existing planning place consumer. City registration is
shanghai/beijing/guangzhou/chongqing. A registration is not an enabled policy/provider.
The returned registry is the intersection of these closed keys, existing SQL consumer
mapping and reviewed installed gate coverage. Missing/unknown mapping remains unavailable.

Admission uses the original live actor/session/policy/consent/task/source contract. The
requested mode is resolved by the original entry, not a client control DTO. Final gates
resolve mode from `turn_private.work.execution_mode`, provider from current policy or
the exact immutable V2 execution profile. AMap cannot be substituted for a model provider.

Grounded city comes from the same-owner/task/turn `grounded_turns.city`, scope_version
and current context, after original `read_grounded_work` / `authorize_grounded_dispatch`
qualification. Its admission city parameter is eligible ONLY through original grounded
admission validation and exact task lineage; a generic HTTP label is not sufficient.
V2 comes from `read_planning_qualified_intake_v1`: exact owner/task/turn/lease plus source
message ID/sequence, intake revision, goal version, and both context digests. Existing
qualification permits only Shanghai area_transport. Legacy text/V1 and scoped edit have
unknown city. travel_directions_v1 is the existing deterministic local mode with no model
attempt/provider; it remains an owned-read/manual alternative, not a registered paid mode.

Unknown city fails closed at admission and final model/tool gate whenever ANY registered
city is disabled. When no city stop is active, unknown city is not itself new authority:
all original mode/provider/source gates still run. No default Shanghai, prose parsing,
tool-coordinate inference, or invented city-independent exemption exists.

All original policy/source/visibility/TTL/actor/epoch/deletion/foreign checks remain.
The new gate supplies only an additional denial. Read-only owned Trip/artifact access
does not become unavailable merely because a consumer is stopped.

## CAS, replay and budget recovery

Control root has a monotonic global revision. set compares expectedRevision to it under
exclusive lock; both stop and explicit enable increment it. The selected control's revision
records that global revision. Its stopRevision increases only on disabled mutations and never
decreases on resume. Replay occurs before CAS, but after live identity and input checks.

operationId is globally unique across set and budget_resume. Immutable operation bytes bind
actor, action and exact canonical input. Identical actor+bytes replay returns the original
result, even after subsequent revisions; another actor or different bytes conflicts uniformly.
Deletion de-identifies actor linkage and retires replay; the UUID remains a minimal tombstone.
Recreating an actor/scope/UUID cannot reapply an old operation.

Scope budget version comes from a new private per-scope fence, not a timestamp read or a
client version. It binds original scope ID/owner/created_at generation. Every actual enabled/
frozen/expiry/limit/provider-tariff mutation and original stop call invalidates its revision;
explicit repeated stop must advance stopRevision even when already disabled. Shared old stop
body replacement is a candidate, not permission to edit an applied migration. Scope deletion
retires this fence; recreation cannot make its old generation resume-eligible.

budget_resume is separate from control resume. It may clear enabled=false and/or frozen=true
ONLY if: scope generation is live, unexpired; no dispatched/pending hold remains; all original
scope/provider exposures and concurrency bounds pass; the required original provider tariff
is still enabled and exact; retained exposure fits the original limits; restore reconciliation
qualifies. It updates only enabled=true/frozen=false and the fence revision. An overrun can be
recovered after genuine settlement only when retained actual costs still fit original limits.
It never increases capacity, changes pricing/expiry, resets any cost/attempt counter, clears
pending, reuses a dispatched attempt, enables a provider/host/policy, or revives old work.
Original task-attempt bounds still apply to any fresh request after recovery.

## Lock graph and dispatch linearization

The unchanged Ops guard acquires settings SHARE -> Auth user KEY SHARE NOWAIT -> mobile
account/original guard -> Auth session KEY SHARE -> active member SHARE. No W2 helper changes
this ordering or uses ordinary membership as authority. Actor-source lock is acquired first.

Original worker order remains owner advisory34/user/mobile -> task/source/turn/work/lease/
policy/consent -> any original budget/profile locks. A new control root SHARE is acquired at
the last authorization point, held through its existing SQL transaction and actual durable
budget dispatch/tool checkpoint claim. Existing V2 basis already locks budget; no helper is
allowed to acquire earlier owner/task/source locks AFTER control. A stop holds Ops actor locks
then control root UPDATE and receipt; it NEVER scans/locks another owner's work or budgets.
Budget resume holds Ops actor -> original scope UPDATE -> per-scope fence UPDATE -> receipt.
It does not acquire control root, and does not promise control eligibility.

New operation advisory/receipt contention, late source locks, restore fence and budget-fence
collisions use NOWAIT/try-lock and abort with bounded unavailable/conflict, never an inverse
wait edge. One mutation/dispatch transaction cannot hold control and then wait for an actor
whose revocation is waiting for control. Audit concrete original order for each replacement;
source inventory records the exact place of the added call.

The last durable effect claim is the SQL linearization boundary. If stop commits first, the
new claim is refused. If claim commits first, the effect is in-flight and the stop receipt
cannot promise unsend/cancellation. A per-provider transport/beforeRequest hook rechecks before
each physical call; rejection after an already dispatched budget must finish pending, not
release/refund. Unsent reserved attempts may be released only through the existing proven
release path. Pending/dispatched holds count in exposure until genuine settlement.
Completion/readback of an already-sent effect remains possible under original privacy fences.

## Lifecycle and restore

Operational controls are global operational state, not member-owned Trip data. Deleting or
revoking their author never enables controls. Actor-linked operation records contain only
operation ID, actor linkage, exact closed scope/action input, revisions/times and bounded
receipt. No question/text/provider payload/credentials/session token is retained.

Account deletion de-identifies linkage, erases recoverable request/receipt payload, and keeps
minimal operation-key/revision tombstones. Scope deletion retires scope generation and erases
recoverable budget target linkage in operation payloads without deleting cost records itself.
Existing budget deletion restrictions remain in force. Membership/session removal does not
grant replay to a new subject; all later reads/mutations still require live current_actor.

Owner metadata export must be integrated into an existing qualified privacy handler; a bare
private export function is not complete coverage. Exact existing handler inventory, closed
section/row parser and sourceState/provenance counts must accompany before/after candidates.
Do not silently add a new D2 product module, inject Ops records into conversation text, or widen
Profile-sensitive erase scope. This integration seam remains a named candidate dependency
until its actual current handler and owner approve the precise projection.

Restore uses accepted K1 `docs/runbooks/backup-restore.md`: ingress/workers denied; sealed
deletion/revocation journal OUTSIDE the restored backup, covering every event after cutoff.
Add control/scope stopRevision, retired operation/scope generations and actor erasure to that
existing journal reconciliation. Restoring an old backup cannot prove latest stop state from
the backup itself. A private recovery fence defaults denied and binds the exact reviewed
reconciled manifest/installed-source version to the current DB boot. Old backup/boot proof
fails closed. No public action enables this fence; operator reconciliation is separately
authorized for the named environment. Normal set/resume does not bypass it. Tests must restore
an older enabled state, replay later stop/deletion markers and show the old receipt cannot
reenable controls or resurrect owner/task/Trip/pending attempts.

## Package and evidence

Before product append: latest migration source inventory, every affected old function's full
before/after plus exact owner/ACL/config/volatility/argument metadata, source body hashes, source
counts and privacy/runtime guard replacements, all zero-effect invariants, new schema/kernel/
lifecycle/ACL full body. Main reviews once; actual holders release only precise shared hunks;
then Main gives the exact append-body lease. No automatic acceptance of an unknown hash.

Source preparation is not full kernel proof. PG17.6 ordered replay/Auth fixtures/concurrency/
revoke/CAS/subject collision/restore/old-Trip zero-effect are required affected proof once
the exact own resource is leased. No full historical matrix or duplicated passing tests.
Docker daemon is currently unavailable; no alternative kernel has been started. Target
Staging stop-resume/role configuration/provider billing/physical device/deployment: UNRUN.
