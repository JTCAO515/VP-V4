# LAUNCH-05 contract evidence

## Implemented boundary

- `user-message-v1` accepts bounded `zh`, `en`, `es`, `ru`, and `ar` input only.
- `assistant-output-v1` is an exact-key envelope and rejects raw provider payloads, reasoning, and unknown Proposal fields.
- Generic telemetry is content-free; it does not contain text or a content-derived digest.
- The only unapproved retention transition is `decision_required -> not_persisted`; no transition enables content persistence.

## Named deterministic evidence

- RL-02: one content-free receipt test and one retry integration test; neither exposes the message text in Turn history.
- RL-06/RL-07: two security fixtures reject root and nested provider payload/reasoning fields before a validated result exists.

These are repository contract fixtures, not Staging, provider, browser, RLS, or privacy-executor evidence.

## Rollback

Revert this Issue's code, tests, ADR, contract, and handoff changes. No durable content or external state exists.
