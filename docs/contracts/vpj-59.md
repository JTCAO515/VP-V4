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
