# RuntimeBudget: durable reservation contract

Status: first real Staging model cost and record-only ServiceTask integration verified on 2026-09-12. See [current evidence](../../artifacts/VPJ-07/service-task-staging-20260912/verification.md). Related to #194; this is not IAP, a supplier invoice or general Production acceptance.
Amounts are integer micro-units of the scope currency, never floating point. A trusted
server supplies the approved scope, owner, task/attempt UUIDs and a conservative maximum
cost from an independently verified model/price version. No client chooses budget limits.

A scope holds a total limit, task limit/attempt count and concurrency limit. Each provider
has its own cap, attempt cap, exact model/price version and kill switch. Admission locks
the scope and checks all aggregates in one transaction, including unresolved holds.
Same attempt identity with different parameters conflicts. Same identity with matching
parameters is a duplicate, never a second dispatch authorization.

Only a newly reserved attempt can transition reserved -> dispatched once. Dispatch
rechecks enabled/expiry state and consumes the kill switch immediately before the
transport consumer. Disabling cannot undo already admitted/in-flight provider work.
Canceled before dispatch may release; dispatched/pending attempts cannot be released
without authoritative usage. Missing usage, timeout and process crash retain the full
reservation and its concurrency slot. No timer silently refunds an uncertain request.

Settlement after dispatch is idempotent only for the same observed cost. A conflict does
not overwrite prior evidence. An observed cost above the reservation must remain recorded
and freeze new scope admission, rather than truncating cost to the cap. This does not
prove a provider obeys token limits; caller pricing/usage validation remains mandatory.

Tables/RPCs are maintenance/server-only with explicit grants and RLS. The public reserve wrapper is SECURITY DEFINER so it can resolve private ServiceTask associations; the private underlying arithmetic and dispatch/finish remain SECURITY INVOKER.
Ordinary users have no budget read/write or RPC permission. Service workers are trusted;
this does not create a new worker login or turn a service key into a user identity. Ordinary native v2 admission and the scoped Staging worker now consume this budget under verified owner/session/policy/price guards. Synthetic owner IDs alone are never C2 authorization; the live test used ordinary policy consent and the existing bound provider.

Rollback disables dispatch and drains/reconciles outstanding reservations. Applied SQL
is append-only; do not delete ledger evidence or rewrite prior migrations. Retained data follows the current text policy; remote deletion or user charging remains a separate scoped action.

## Scoped C0 budget debit interpretation

The isolated20260910 synthetic provider campaign uses the explicit
[C0 accounting v1](../benchmarks/vpj-06/c0-cost-accounting-20260910.md) interpretation:
validated usage at frozen upper tariffs may settle a conservative budget debit, with
a durable cost-basis sidecar and actualBilledCost=unknown. This limited interpretation
does not establish a supplier invoice, customer charge or new production billing policy.
Unknown/uncovered charges retain their holds; existing settlement cannot be overwritten.

## Trusted scope stop v1

`stopDurableBudget` calls server-only `stop_model_budget(scope, owner)` through the existing
bounded Supabase RPC adapter. The database locks the same scope row as reserve, dispatch and
finish, disables admission, releases only `reserved` attempts, and marks `dispatched` attempts
`pending`. Existing pending holds, actual settled usage, frozen state, ownership, limits and
attempt identities are preserved. A repeat stop succeeds with zero new transitions; an unknown
acknowledgment may safely retry. Counts are transition counts, not refunds or provider cancellation.

Dispatch serialized before stop may already invoke a provider, including when its acknowledgment
arrives after stop. Stop cannot retract that authorization. The full pending reservation and
concurrency slot remain held until authoritative usage is settled with the existing finish RPC;
there is no expiry refund. Late legitimate usage can still settle while disabled, including an
overrun that freezes the scope. A scope stopped first cannot authorize new dispatch.

This is an explicit trusted server/operator action, not an automatic startup recovery sweep,
public route, permission revocation or customer quota. Re-enabling is a separate authorized
maintenance action; it cannot change owner, clear unknown charges or unfreeze overrun evidence.
The migration creates no active scope and grants no ordinary user permission. New Ask pricing
and the older ServiceTask/Credit direction remain unresolved commercial semantics; this stop
mechanism implements neither. Daily testing decisions do not remove technical fault limits.

Code rollback removes the consumer while preserving the append-only function and ledger.
Stopped scopes remain disabled; rollback must not automatically re-enable them. Remote migration,
operator identity and deployed scheduling remain separately gated.


## Record-only ServiceTask budget binding

Migration37 resolves an associated old-worker Turn ID or a ServiceTask ID to the same task before applying the existing cost arithmetic. It pins the first successfully reserved budget scope atomically; denial does not pin, release does not clear, and a different scope rejects. Unassociated legacy Turns retain their original budgets. Identity locks prevent Task/Turn UUID collisions, and bound threads reject legacy unassociated appends. The underlying unbound function is private and has no direct worker/client execute grant.

The 2026-09-12 two-language real provider run observed four settled attempts under two tasks, with no unknown hold and no duplicate dispatch from exact replay. Multi-worker crash/timeout/stop adversarial evidence remains the actual controlled PostgreSQL/transport suite, not a claim of a real supplier outage. Record-only supports no user consumption or invoice truth; #227 owns later commercial policy.

## Validated usage journal and explicit Staging reconciliation

The dedicated one-shot and service workers now fsync a closed
`vpj07-usage-journal/1` record after protocol/model/usage validation and trusted
integer pricing, before their existing SQL settlement. The nested
`validated-model-usage/1` receipt binds the original attempt, Turn, owner, scope,
policy, pinned model/price, reservation and normalized usage. It contains no input,
answer, evidence text, credentials or supplier invoice claim. The worker's supplied
Turn ID is resolved to its existing ServiceTask by the unchanged reserve RPC.

If journaling or settlement is interrupted, the original hold remains. Missing,
invalid or unpriceable usage produces no validated receipt and is never reconstructed.
A later caller timeout cannot replace an earlier cancellation cause while the
pending-cost write drains; both paths still retain the unknown hold.

An explicit trusted operator may run `lib/server/jobs/reconcile-staging-text-usage.mjs`
with `VISEPANDA_STAGING_USAGE_RECONCILE=true`, the existing worker credential, and
`--config <original-job-or-service-file> --journal <original-journal> --receipts <new-file>`.
It accepts the exact configuration digest, private regular files owned by the current
OS user, and the matching ordinary/thinking/service journal version. An expired
service configuration can reconcile already incurred usage; it cannot start new work.
All complete records are validated before any settlement I/O. A torn final append is ignored,
never repaired into invented usage. Conflicting records stop the run.

The command performs only `finish_model_budget(..., 'settle', observedMicros)` against
the fixed Staging project. Exact repeat acknowledgements are successful; a lost
acknowledgement can safely be replayed. Different settled costs are never overwritten,
unknown attempts never released, overrun freezing remains authoritative in SQL,
and ordinary-user grants are unchanged. Recovery never reserves or dispatches,
invokes a model, restarts an answer, submits a Turn or changes a Trip.

This is a trusted worker/operator evidence file, not a cryptographically signed
supplier receipt or a new public upload surface. Keep it private and retain the
original configuration and journal. A process lost before durable validated usage
still needs authoritative usage evidence; no time-based refund exists. Restoring a
budget attempt does not itself restore a lost answer or establish customer Ask/IAP
consumption. Rollback removes the sink/command while preserving journals and ledger.
