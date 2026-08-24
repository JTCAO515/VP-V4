# ADR-0006: New V4 Supabase lineage

Status: accepted on 2026-08-24 through explicit operator delegation.

## Decision

VisePanda AI uses a new V4 Supabase lineage. VP-Final contributes only AI-02-approved behavior contracts and golden tests; it contributes no migrations, service roles, environment files, production data, or provider defaults.

## Consequences

- AI-08 owns local/CI connection proof; AI-10 owns durable Trip persistence.
- Migrations are append-only and created from the V4 actor/RLS and contract baseline.
- No database account, project, or credential is created by this ADR.

## Rollback

Keep fixture-only operation and disable the new persistence path. Never rewrite accepted migrations or import historical production data without a separate recovery decision.
