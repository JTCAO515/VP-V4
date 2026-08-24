# ADR-0007: Authenticated-only closed beta

Status: accepted on 2026-08-24 through explicit operator delegation.

## Decision

Durable Trip, Turn, user artifact, preference, and audit state require an authenticated closed-beta identity. Anonymous users may see only non-persistent previews; there is no durable guest Trip model in R1.

## Consequences

- AI-04/AI-14 must bind every durable read/write to verified actor and RLS policy.
- Share, invite, recovery, and guest behavior require separate contracts.
- Preview UI must not imply that input or Trips are saved.

## Rollback

Disable durable writes for the identity class and retain only data permitted by the accepted retention policy.
