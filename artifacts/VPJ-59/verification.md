# VPJ-59 local durable budget verification

Implemented PostgreSQL scope/provider/task/attempt limits and a server dispatch consumer.
The appended SQL creates no enabled budget scope. Existing25 migration files are unchanged.
No remote migration, provider request, production configuration or real user policy activation.

Actual local evidence:
- Isolated PostgreSQL17 container(network none, no published ports):9/9 tests PASS, zero skips.
  Separate SQL clients exercise reserve/dispatch races; a killed Node worker leaves a
  committed dispatched reservation visible to a fresh process. Timeout/unknown usage holds,
  idempotent/conflicting settlement, overrun freeze, owner/model/price mismatch, ordinary
  role denial, cross-provider task limits and kill/expiry/downward-limit checks execute SQL.
- This test creates only a minimal auth.users FK fixture. It proves database role/lock/ledger
  behavior, not Supabase Auth/JWT, the full25->26 upgrade or a Staging worker connection.
- Typecheck/lint PASS. Contracts188/188, units45/45 and affected cost/protocol/observability
  security/integration11/11 PASS, zero skips. Seven new contract checks are included in188.
- The first DB run passed7/9: two fixture configurations exceeded their own provider cap;
  corrected fixture inputs passed9/9. No database constraint was weakened.
- Initial full unit run44/45 failed because an old governance test launched unrelated live
  local integration tests while expecting all unavailable. It now runs the real suite recorder
  against a dedicated skipped fixture directory; final45/45 passed without touching that DB.
- docs/diff PASS. db:verify reports local-service-running/available-for-explicit-probe only;
  its output does not establish worker/user acceptance.

Independent review found a late-output bug while awaiting unknown-cost accounting. Fixed
by rechecking cancellation/timeout after pending acknowledgment, with both regressions PASS.

A fresh exclusively owned local Supabase stack replayed original25, then appended26 using
CLI --local --skip-vault. Real GoTrue password logins and PostgREST budget RPC/role checks
passed1 aggregate integration test, zero skips: pre-upgrade Trip unchanged, other-user Trip
hidden, owner/other/anon budget reads/RPC denied, service SDK reserve/dispatch/settle works.
All run-owned rows/accounts were cleaned(Auth0/Trip0/Budget0/history26). Local DB lint
--level error --fail-on error exited0. The owned stack and its data volumes were removed.
This additional evidence covers local full Supabase compatibility, not Staging execution.

A dedicated path-filtered Linux Budget PostgreSQL CI job runs the real9 checks rather than
relying on the default integration skip. Full required CI and independent exact-HEAD review
are pending. #194 remains OPEN: actual model price/usage, policy, Staging worker and remote
migration acceptance are not supplied by these local results.

Reproduction: the standalone cost test needs only the pinned Docker image and VP_BUDGET_DB_TEST=1. The full Supabase test requires a fresh unlinked project_id=vpj59-full-local, API55441/DB55442, original25 migrations and GoTrue/PostgREST/Kong; set VP_BUDGET_SUPABASE_WORKDIR to that owned directory. It itself appends26 and cleans exact fixture IDs. Never point this fixture at an existing shared or remote project.

2026-09-11 scoped stop increment: see [stop verification](stop-runtime-verification.md)
and [commands](stop-runtime-commands.jsonl). Actual isolated budget SQL13 and full-migration
Turn/text SQL22 pass with zero skips. This extends operator recovery without remote activation.
