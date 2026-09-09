# VPJ-59 durable budget slice

Related to #194. Local database implementation of the accepted RuntimeBudget seam:
atomic scope/provider/task/attempt caps, one dispatch admission per attempt, durable
settlement and unresolved reservations after timeout/crash. No IAP or customer quota.

The new operator grant supplies C0 test caps(each provider CNY30,total90), not a production
budget or permission to apply this new SQL remotely. Existing Staging25 and protocol
PR275 provide integration leads; #189/#193 remain incomplete. This slice must prove
actual local PostgreSQL concurrency/restart behavior and a dispatch consumer with an
injected transport, without claiming real provider or Staging worker acceptance.

Scope: model-gateway/budget, one appended migration, cost tests and the affected contract/
evidence. A path-filtered Budget PostgreSQL CI job is an adjacent change so these critical
concurrency/crash checks execute on Linux instead of remaining default-skipped.
The existing governance unit test was also isolated to its own skipped-test directory:
it previously launched all integration tests and failed when an unrelated local Supabase
was running. This preserves the outcome assertion without touching another database. Existing CostGuard remains a compatible step/deadline guard. No prompt/output,
secret, Trip mutation, real account setup, production deployment/configuration or remote
migration is part of this slice. A follow-up remote migration requires explicit same-target
scope extension; preserve the current25 files byte-for-byte.

Validation: real local Postgres transactions and separate worker processes; duplicate and
conflicting attempts; scope/provider/task/attempt caps; disabled/expired dispatch; unknown
usage/crash reservations; idempotent/conflicting settlement; ordinary-role denial. Required
CI plus affected contract/security tests and exact-HEAD independent review apply. Fixtures
provide synthetic inputs only; database behavior must actually execute.
