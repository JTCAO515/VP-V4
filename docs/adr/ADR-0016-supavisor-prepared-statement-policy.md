# ADR-0016: Supavisor transaction-pooler prepared-statement policy

Status: accepted on 2026-08-25 through explicit operator delegation.

## Context

AI-46 originally required a transaction-pooler prepared statement to fail. On the new VisePanda project, the remote shared Supavisor transaction pooler accepted `PREPARE vp_pooler_probe AS SELECT 1` and a subsequent `EXECUTE vp_pooler_probe` through separate CLI queries. The observed server behavior therefore cannot support a fail-closed product invariant that requires failure.

Supabase guidance still requires clients in transaction mode to disable automatic or named prepared statements; driver behavior and Supavisor capability can vary by client, mode, and release.

## Decision

The VisePanda invariant is client-side, not an assumption about a server rejection:

- SystemDataAdapter transaction-pooler connections use shared Supavisor transaction mode (`6543`) and disable named/automatic prepared statements.
- A Postgres.js adapter uses `{ prepare: false }`; node-postgres query definitions omit `name`.
- The direct connection remains migration, `pg_dump`, restore, and native management path. The session pooler is only an IPv4 fallback when direct IPv6 is unavailable.
- A prepared-statement success or failure is recorded as a conformance observation, never used to silently weaken the client policy.

## Consequences

- AI-46 acceptance records the actual remote result and freezes the client policy; it no longer falsely requires a server-side failure.
- The first concrete SystemDataAdapter must have an adapter-level test proving the selected driver configuration. A later driver change reruns this conformance test.
- No user request is processed through the service credential; user and Ops paths retain JWT/RLS/RPC authority.

## Rollback

Disable the affected SystemDataAdapter route and use the last evidence-backed connection profile. Do not fall back to a client with named prepared statements.
