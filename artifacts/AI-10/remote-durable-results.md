# AI-10 remote durable results — 2026-08-26

Target project: `dzqdzetcctkhbrhlxxgn`.

- Remote migrations `20260825160314` and `20260825160458` were applied through linked Management API SQL and recorded in migration history.
- Owner RPC apply returned `applied` at version `1`; same key/digest returned `already_applied`; changed digest returned HTTP `400`.
- Resulting Trip title/version was `After`/`1`; exactly one event and one audit row existed.
- Remote fault injection covered `trips`, `trip_events`, `trip_proposals`, `trip_idempotency`, and `trip_audit_events`. Each transaction exited nonzero and left the probe at `Before`/`0`/`pending` with `0` event, audit, and idempotency rows.
- Temporary Auth user, Trip, Proposal, event, audit, and idempotency rows were deleted at the end of the probe.

No credential, token, user ID, email, or connection string is retained.
