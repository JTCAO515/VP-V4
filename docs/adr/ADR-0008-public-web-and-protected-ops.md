# ADR-0008: Public Web with later protected Ops deployment

Status: accepted on 2026-08-24 through explicit operator delegation.

## Decision

R1/R2 remain a public Next.js modular monolith. Candidate import, review, and publication do not receive an Ops UI until a real curation workflow requires a separately protected deployment with isolated identity, role, secret, and audit boundaries.

## Consequences

- Public Web never receives Ops/service-role privileges.
- AI-25 owns the future protected Ops deployment.
- Candidate/review actions remain unavailable until their contract and deployment boundary exist.

## Rollback

Disable the protected deployment and keep public consumers on reviewed projections only.
