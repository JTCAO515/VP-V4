# LAUNCH-05 Message, Assistant Output, and Retention Contract

## Purpose and status

This is a pure, versioned contract for handling a user message before durable content storage is authorized. It is not evidence that Chat, a model provider, message persistence, a deletion executor, or a retention policy is live.

The enforced default is fail-closed: `decision_required` plus `capture_attempted` becomes `not_persisted`, with `contentPersistence: false` and `telemetry: content_free`.

## Closed input and output shapes

`user-message-v1` accepts exactly these fields:

| Field | Rule |
| --- | --- |
| `schemaVersion` | Exactly `user-message-v1`; unsupported versions fail closed. |
| `messageId`, `threadId`, `idempotencyKey` | Opaque ASCII identifier, 1–160 characters. |
| `locale` | Exactly one of `zh`, `en`, `es`, `ru`, `ar`. |
| `text` | Non-blank UTF-16 string of at most 4,000 characters. |

`assistant-output-v1` accepts exactly `schemaVersion`, `turnId`, `message`, `cards`, and `proposal`. Its message is one of `answer`, `clarification`, or `unavailable`, with non-blank text of at most 8,000 characters. It accepts at most 12 cards. Cards are closed display-only `summary`, `warning`, or `unavailable` values; a later claim-owning contract must validate any executable or evidence-backed card. A non-null pending Proposal is recursively allowlisted before the existing immutable `TripProposal` contract validates it. `unavailable` has no cards or Proposal.

Unknown fields fail validation. In particular, `rawProviderPayload`, `reasoning`, prompt text, provider credentials, cookies, and secret-bearing transport metadata do not belong to this envelope.

## Retry and stream boundary

`messageRequestDigest` exists only for an in-process idempotency comparison. It is intentionally excluded from receipts because a digest of a short message can still be sensitive metadata. The existing Turn request registry reuses a matching `threadId + idempotencyKey + digest` and rejects a changed digest. Turn events continue to carry lifecycle state only, never message text or provider token deltas.

## Data classification, redaction, and telemetry

User message text is classified as `c2_trip_sensitive` by default. This contract does not promise automated PII redaction or safety detection. A content-free telemetry receipt contains only its schema version, the C2 classification, `not_persisted`, and `content_free`; it excludes caller-supplied IDs, locale, content, content-derived digest, provider output, reasoning, and secrets.

## Retention decision matrix

| Decision area | Current enforced state | Operator decision required before durable content storage |
| --- | --- | --- |
| User and assistant content persistence | `not_persisted` | Whether storage is permitted and the exact retention/deletion rule. |
| Provider transmission | No provider path in this contract | Provider, region, data terms, task scope, and budget. |
| Generic telemetry | Content-free only | Any additional field must have a data-class and policy review. |
| Backup and restore | No content exists | Backup inclusion, deletion exception, recovery and disclosure. |
| Export/delete | No durable message record exists | Complete owner-scoped export/delete lifecycle and proof. |

The LAUNCH-15 operator action remains the only place to approve values. This table does not propose a number of days or make a legal/public commitment.

## Verification and rollback

The contract tests cover five-locale validation, bounded input, malformed and unknown fields, content-free telemetry, retry convergence, and unavailable-output rejection. Security tests prove the contract rejects reasoning and that receipts exclude input text. Integration and database/RLS evidence remain explicitly unrun until the Staging gate exists.

Rollback is a code revert. There is no migration, durable user content, provider request, or external configuration to clean up.
