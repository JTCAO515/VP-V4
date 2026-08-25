# AI-10 remote fault results — 2026-08-26

Target project: `dzqdzetcctkhbrhlxxgn`.

- Migration `20260825161535` is recorded remotely; `private.ai10_confirm_fault_trigger()` and five non-internal `ai10_fault_after_*` triggers were verified present.
- An `authenticated` owner transaction was faulted after each durable write point: `trips`, `trip_events`, `trip_proposals`, `trip_idempotency`, and `trip_audit_events`.
- Each fault returned a nonzero command result. After every attempt, the probe remained `title=Before`, `head_version=0`, `proposal.status=pending`, and event/audit/idempotency counts were all `0`.
- The temporary Auth user and all dependent probe records were deleted; the final count for every probe relation was `0`.

No credential, token, user ID, email address, database password, or connection string is retained.
