# ADR-0020: Unapproved message retention fails closed

Status: proposed on 2026-08-30. This ADR records an engineering boundary; it does not approve a retention duration, region, provider, or public privacy statement.

## Context

LAUNCH-05 needs a versioned shape for user messages and validated assistant output before a real provider, durable message store, or public retention promise is introduced. User message text is C2 trip-sensitive by default and may contain more sensitive material. Raw provider payloads and reasoning are not safe substitutes for a product contract.

The retention decision remains an operator-owned action in `docs/operator-actions.json`. No duration, backup exception, deletion SLA, approved region, or provider data term has been selected.

## Decision

- Accept only the closed five-locale `user-message-v1` input and `assistant-output-v1` envelope described in `docs/contracts/launch-05-message-output-retention.md`.
- Treat a capture attempt under an unapproved policy as `not_persisted`; generic telemetry may contain only a content-free receipt.
- Do not include message text, a prompt digest, assistant text, provider payload, provider reasoning, cookie, credential, or secret in the receipt.
- Reject unknown fields in the assistant envelope. An unavailable result cannot contain a card or Proposal.
- Do not add a durable message table, retention job, provider adapter, or user-facing retention claim in this decision.

## Consequences

Retry handling may compare an in-process request digest, but that digest is not a telemetry or persistence field. The existing Turn idempotency registry can reuse a Turn without putting the message text in Turn events.

Before durable content storage is enabled, the operator must approve retention, deletion, backup, region, provider terms, and user-facing disclosure through the LAUNCH-15 decision path. A later ADR and migration must supply owner RLS, export/delete coverage, expiry behavior, and recovery evidence.

## Rollback

Revert the pure contract and its tests. This ADR creates no stored user content, external account, provider call, migration, or public promise.
