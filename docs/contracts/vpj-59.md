# RuntimeBudget: durable reservation contract

Status: local PostgreSQL and Supabase25->26/HTTP implementation verified, no remote activation. Related to #194.
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

Tables/RPCs are maintenance/server-only, SECURITY INVOKER with explicit grants and RLS.
Ordinary users have no budget read/write or RPC permission. Service workers are trusted;
this does not create a new worker login or turn a service key into a user identity. No
client route or provider default transport is enabled. Local synthetic owner IDs are not
real C2 authorization. Auth/session, policy and price verification are separate admission
requirements for the future runtime consumer.

Rollback disables dispatch and drains/reconciles outstanding reservations. Applied SQL
is append-only; do not delete ledger evidence or rewrite prior migrations. Exact remote
retention/deletion rules and actual Staging worker credentials remain future gates.

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
