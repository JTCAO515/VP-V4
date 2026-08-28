# AI-37 unrun checks

- No upload, OCR, PDF/image/ICS parsing, mailbox/provider login, external request, account,
  credential, persistent store, database, RLS, real Proposal writer, Trip writer, cache, browser,
  staging or production action exists or was attempted.
- This C0 does not prove source-file redaction, TTL deletion, user authentication, cross-process
  idempotency, reload durability, timezone/station/airport normalization, or a user-visible import
  flow. Those require separately accepted durable and external boundaries.

Residual risk: future ingestion must redact before extraction/persistence, authenticate the owner,
keep raw artifacts isolated and expiring, and atomically persist any Proposal without a direct Trip
write.

Rollback: revert AI-37 files. No external or durable state exists.
