# ADR-0014: Actor, credential, and data-adapter boundary

Status: accepted on 2026-08-24 through explicit operator delegation.

## Context

ADR-0006 selects a new V4 Supabase lineage, ADR-0007 selects authenticated-only durable beta state, and ADR-0008 keeps R1/R2 on a public Web deployment without an Ops UI. The system needs an explicit boundary before any migration, RPC, or credential can be introduced: user authorization must remain inside the user-JWT/RLS transaction, while secret-bearing work must remain worker-only.

## Decision

VisePanda freezes three non-interchangeable data-adapter paths:

1. `UserDataAdapter` carries a verified end-user JWT to `security invoker` Data API/RPC boundaries. Durable owner-scoped actions, including future `confirmAndApplyProposal`, execute as one user-JWT database transaction so `auth.uid()` and RLS are authoritative.
2. `OpsDataAdapter` is unavailable in R1/R2. It may exist only with a separately protected Ops deployment, verified author/reviewer/admin JWT role, scoped RPC, least privilege, and audit. Public Web receives neither its credentials nor its routes.
3. `SystemDataAdapter` is worker-only. It uses a server secret and private schema/RPC only for a named job/entity/version/policy condition and writes an allowlisted audit record. It cannot impersonate a user or supply ordinary user/Ops requests.

Anonymous visitors may read only explicitly granted public preview/projection data. They have no durable Trip, Turn, preference, user-artifact, or audit state. Existing Early Access records are not migrated into V4: any future transfer requires a separately accepted mapping, lawful basis/consent review, source-to-target field inventory, retention rule, and reversible rehearsal.

## Consequences

- A browser, Route Handler, Server Action, public Web API, or model adapter never receives a service credential.
- UI hiding and TypeScript owner checks are supplementary only; RLS/RPC authorization remains the database decision point.
- V4 has no inherited Supabase project, migration history, service role, legacy Early Access data, or environment configuration.
- AI-08 must prove the three connection paths before a database-dependent slice; AI-14 must implement and negative-test the RLS/RPC matrix; AI-25 owns a future protected Ops deployment.
- No database, account, credential, migration, login flow, invite flow, or deployment is created by this ADR.

## Rollback

Keep fixture-only behavior and disable the relevant runtime capability. A future adapter deployment is rolled back by disabling its route/worker, revoking its scoped credential, and retaining only audit data permitted by the then-accepted retention policy. No historical V4 data is imported as a rollback shortcut.
