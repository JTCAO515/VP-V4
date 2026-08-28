# User Artifact C0

AI-37/#39 implements an in-memory, metadata-only confirmation boundary for a user-corrected flight
or rail segment. It never accepts or stores source files, OCR text, screenshots, PDFs, ICS content,
PNR, ticket number, QR payload, passport data, account data, URLs, provider output or raw payloads.

The input is a closed record: opaque owner/import/artifact/Trip IDs, one source kind, four completed
redaction declarations, a closed typed segment, a confirmation instant and a non-negative Trip base
version. The result is either a version-one user artifact plus a receipt-shaped pending proposal, or
a closed denial. It cannot invoke a Trip writer; no snapshot, patch, database or external state is
returned. Exact repeated imports are idempotent; a changed import ID digest is a conflict.

RL-06/RL-07 have 3/3 deterministic injection fixtures (PNR, ticket number and QR payload). The
runtime invariant is closed-key validation before an artifact or proposal exists. This C0 proves
redaction gating and ownership metadata only; it does not parse media, persist TTLs, perform OCR,
create a real Proposal record, authorize a user, or apply a Trip change.

Rollback: revert this module, tests, contract and evidence. No external or durable state exists.
