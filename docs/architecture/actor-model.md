# AI-04 Actor, Credential, and Data-Adapter Model

Status: accepted R0 architecture baseline for [AI-04](https://github.com/JTCAO515/VP-V4/issues/6). This is a permission and migration design record, not a running Supabase topology. No credentials, project IDs, migrations, RLS policies, Route Handlers, provider calls, or persistent VisePanda AI behavior are created here.

## Decision summary

- New V4 Supabase lineage only; VP-Final database history, records, credentials, and environment defaults are not reused.
- Durable beta state is authenticated-only; anonymous use is preview-only and non-persistent.
- R1/R2 has no Ops UI or Ops route on the public Web deployment.
- Authorization is finalized by user/Ops JWT plus RLS and role-scoped `security invoker` RPC. [ADR-0019](../adr/ADR-0019-trip-snapshot-rollback-authorization.md) records the only current user-JWT `security definer` exception for atomic Trip snapshot/rollback functions; a server secret never stands in for a user or reviewer identity.
- One worker-only system path may use a secret/private schema only with explicit entity/version/policy conditions and an allowlisted audit record.

The controlling ADRs are [ADR-0006](../adr/ADR-0006-new-v4-supabase-lineage.md), [ADR-0007](../adr/ADR-0007-authenticated-closed-beta.md), [ADR-0008](../adr/ADR-0008-public-web-and-protected-ops.md), and [ADR-0014](../adr/ADR-0014-actor-credential-and-data-adapter-boundary.md).

## Actors and credential routes

| Actor | Credential route | Allowed scope | Explicit denial |
| --- | --- | --- | --- |
| Public visitor | publishable public client context | explicitly granted public preview/projection reads only | durable Trip/Turn/preference/artifact/audit state; candidate/draft/private data; Ops actions |
| Authenticated owner | verified user JWT through `UserDataAdapter` | own durable Trip, Turn, preference, confirmed artifact reference, and permitted proposal actions | other-user rows; reviewer/admin actions; service credential; direct model/database bypass |
| Content author | future verified role JWT through separate `OpsDataAdapter` deployment | create private candidate/import/change-set work within granted scope | self-review/publish; public-Web route; service credential |
| Reviewer | future verified role JWT through separate `OpsDataAdapter` deployment | independent review/publish within granted scope with audit | review own authored change; public-Web route; service credential |
| Ops admin | future verified role JWT through separate `OpsDataAdapter` deployment | narrowly enumerated operational override/audit workflow | broad public deployment access; unlogged content mutation; ordinary user impersonation |
| System worker | `SystemDataAdapter` server secret + private schema/RPC | named job/entity/version/policy work, projection/index maintenance, and allowlisted audit | browser access; user/Ops request handling; open-ended SQL; identity impersonation |

`ActorResolver.resolve(request)` verifies session/role material only. It does not decide ownership for arbitrary resources; the owning module applies the resource contract and the database enforces RLS/RPC authorization.

## Frozen data adapters

| Adapter | Caller and credential | Database boundary | Transaction rule | Not for |
| --- | --- | --- | --- | --- |
| `UserDataAdapter` | server route/action acting with verified user JWT | public schema, RLS, role-scoped `security invoker` RPC, or the two fixed ADR-0019 owner-checked RPCs | one user-JWT RPC for multi-table owner actions | service secret, public anonymous mutation, Ops review |
| `OpsDataAdapter` | separate protected Ops deployment with verified scoped JWT | Ops-exposed role-scoped RPC and RLS | audit author/reviewer/admin action within its transaction | R1/R2 public Web, browser service secret, worker impersonation |
| `SystemDataAdapter` | private worker with server secret | private schema/RPC and explicit resource conditions | named job/entity/version/policy inputs plus allowlisted audit | user/Ops request path, arbitrary SQL, unscoped table scan |

### Mandatory request rules

1. Treat Route Handlers and Server Actions as public HTTP endpoints: authenticate, authorize, validate input, and apply same-origin/CSRF controls on every call.
2. Future `confirmAndApplyProposal` must use one user-JWT `security invoker` RPC transaction unless an accepted ADR documents a smaller fixed-function exception. ADR-0019 permits only the named Trip snapshot/rollback functions with database-side `auth.uid()`, owner predicates, locks, fixed search path and no service credential.
3. No BFF may open a service-key transaction and reproduce owner checks in TypeScript. UI visibility, client-side route guards, and model tool restrictions cannot replace RLS.
4. System jobs use a closed job contract and explicit resource identifiers. They cannot accept arbitrary URLs, SQL, model prompts, table names, or an actor override.
5. A public projection remains a projection: each public read later rechecks authoritative eligibility/freshness. Candidate, draft, expired, private, and licence-blocked rows remain denied.

## Actor × resource × operation matrix

This is the acceptance target for AI-14/RLS implementation. “Later” means the resource has no current runtime implementation; it is not a permission grant.

| Resource / operation | Public visitor | Authenticated owner | Content author | Reviewer | Ops admin | System worker |
| --- | --- | --- | --- | --- | --- | --- |
| Public reviewed Explore projection read | allowed only after public eligibility grant | allowed under same eligibility | later via Ops only if needed | later via Ops only if needed | later via Ops only if needed | rebuild/read with eligibility condition |
| Own Trip/Turn/preference read | denied | owner-only later | denied | denied | audit-only later, no general read | named job only |
| Own Trip write / confirm proposal | denied | owner-only later via single user-JWT RPC | denied | denied | denied except a separately audited emergency contract | denied |
| Candidate/import/change-set create | denied | denied | later, private scoped only | denied | later, audited scope only | prepared job only, never public |
| Review/publish Fact or projection | denied | denied | denied for own work | later, independent reviewer only | later, audited override only | denied except deterministic projection rebuild from already eligible data |
| User artifact / raw media | denied | own reference only after policy/TTL gate | denied | denied | metadata/audit only later | named job only, no general log |
| Audit / operational trace | denied | own minimal user-visible history later | own action audit later | own action audit later | scoped operational audit later | allowlisted append-only audit |
| Secret / private schema | denied | denied | denied | denied | denied by default | worker-only, named operation |

## Deployment and secret boundary

```text
Browser
  -> public Next.js Web: verified public/user JWT only; no service credential
      -> UserDataAdapter: RLS + security-invoker RPC

Future protected Ops deployment
  -> OpsDataAdapter: verified scoped Ops JWT + role-scoped RPC

Private worker only
  -> SystemDataAdapter: server secret + private RPC + entity/version/policy + allowlisted audit
```

The public deployment remains a frontend/product preview until later runtime issues satisfy their gates. Its environment has no Ops or system-worker secret. A future worker secret is stored only in the server-side secret store of the worker environment and is rotated/revoked by the runbook that owns that future deployment; it is never copied to the browser, public build, log, screenshot, fixture, or repository.

## Lineage and Early Access disposition

| Source | V4 disposition | Reason | Future gate |
| --- | --- | --- | --- |
| VP-Final Supabase migrations/RLS/schema | retire; rebuild append-only from V4 contracts | historical assumptions and actor model are not V4 authority | AI-08, AI-10, AI-14 |
| VP-Final service credentials/environment files | retire | secrets and scopes are never migrated | no reuse |
| VP-Final production data | do not import | no accepted V4 lineage, field inventory, consent, or retention basis | separate approved migration plan |
| Existing Early Access records | do not import automatically | a signup record is not a V4 authenticated beta identity or permission | separate mapping, notice/consent, rehearsal, and rollback |
| AI-02-approved golden contract tests | reuse only through V4 seam | behavior evidence may be useful without copying data/configuration | AI-09, AI-11, AI-14, AI-23–25 |

## Acceptance, observation, and rollback

Deviation classification: D2 — a cross-module authorization and data-lineage contract, reversible before any account/database deployment.

| Dimension | Status | Evidence or boundary |
| --- | --- | --- |
| Functional | applicable | actor, credential, adapter, and operation matrix is frozen for later implementation |
| Interface | applicable | three data adapters and `ActorResolver` responsibility are explicit |
| Data | applicable | no legacy schema/data migration; Early Access transfer is explicitly denied pending a separate plan |
| Security | applicable | JWT/RLS final authorization; no service-key impersonation; browser secret denial |
| Performance | not applicable | no running request/database path exists |
| UX | not applicable | no auth/Ops interface is introduced |
| Observability | deferred | future adapter actions require allowlisted audit and owner/cadence evidence |
| Compliance | applicable | no user data, secret, account, or cross-border transfer is activated |

- L1–L3: `pnpm check`, `pnpm docs:check`, JSON and diff checks.
- L4: future AI-14 security/RLS and AI-08 connection conformance; no runtime suite is claimed here.
- L5–L7: explicitly unrun because this issue changes no UI, deployment, or production behavior.
- Rollback: revert this documentation/ADR slice. A future runtime rollback disables the relevant adapter route/worker and revokes only its scoped credential; it does not recreate old lineage or import historical data.
