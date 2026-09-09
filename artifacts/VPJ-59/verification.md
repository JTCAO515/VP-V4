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
- Typecheck/lint PASS. Contracts187/187, units45/45 and affected cost/protocol/observability
  security/integration11/11 PASS, zero skips. Six new contract checks are included in187.
- The first DB run passed7/9: two fixture configurations exceeded their own provider cap;
  corrected fixture inputs passed9/9. No database constraint was weakened.
- Initial full unit run44/45 failed because an old governance test launched unrelated live
  local integration tests while expecting all unavailable. It now runs the real suite recorder
  against a dedicated skipped fixture directory; final45/45 passed without touching that DB.
- docs/diff PASS. db:verify reports local-service-running/available-for-explicit-probe only;
  its output does not establish worker/user acceptance.

A dedicated path-filtered Linux Budget PostgreSQL CI job runs the real9 checks rather than
relying on the default integration skip. Full required CI and independent exact-HEAD review
are pending. #194 remains OPEN: actual model price/usage, policy, Staging worker and remote
migration acceptance are not supplied by these local results.
