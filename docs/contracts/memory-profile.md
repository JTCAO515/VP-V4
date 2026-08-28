# V4-13 Memory Profile contract

**Owner:** Memory Profile (#98 / V4-13)
**Status:** implemented database and deterministic projection baseline; no Copilot, provider, UI, or production-runtime acceptance is implied.
**Consumers:** V4-14 Memory governance UI and V4-15 Chat/Canvas receipt consumers.
**Non-consumers:** Demo fixtures, homepage/profile placeholders, models, tools, providers, and direct Trip writes.

## Objective and anti-goals

This contract makes one user-owned memory's lifecycle, consent and origin inspectable before a
future consumer can retrieve it. It corrects the absence of a durable Memory contract without
creating a default traveler profile or turning inferred text into a product constraint.

It does not render memory UI, ingest a prompt/artifact/provider payload, make a model call, mutate
a Trip, export/delete account data, or claim a running Supabase migration. V4-17 owns privacy
erasure and retention evidence; V4-15 owns concrete Turn/Proposal/Trip impact receipts.

## Frozen record and lifecycle

`memory_profiles` is owned by one `auth.users` identity and has an immutable source receipt,
consent reference, constraint kind, bounded canonical summary and timestamps. The lifecycle is:

```text
explicit ─┬─> paused ─┬─> explicit | confirmed
          │           └─> rejected | deleted
          └─> rejected | deleted
inferred ─┬─> confirmed
          ├─> paused ─> confirmed | rejected | deleted
          └─> rejected | deleted
confirmed ─> paused | rejected | deleted
rejected/deleted ─> terminal
```

The persisted states are exactly `explicit`, `confirmed`, `inferred`, `rejected`, `paused` and
`deleted`. `deleted` clears the retrievable summary and remains only as a lifecycle tombstone until
V4-17 implements privacy erasure. `memory_receipts` records the source event and every user
lifecycle transition, without raw prompt, provider-output or artifact contents.

`memory_consents` has only `granted` and `revoked`. A consent is owner-scoped and is required to
create an explicit memory. Revoking it immediately removes every linked profile from the retrieval
projection; it does not silently delete records or imply V4-17 completion.

## Eligibility and precedence

`read_retrievable_memory_profiles()` returns only the calling owner's profiles where consent is
`granted` and state is `explicit` or `confirmed`. `inferred`, `rejected`, `paused` and `deleted`
profiles are excluded. Eligible `hard_constraint` rows sort before eligible `preference` rows.

An inferred profile can never have `constraint_kind = hard_constraint`; the database check and the
pure `assertMemoryProfile` guard both reject it. A hard constraint may later be paused/rejected or
deleted, but it no longer enters retrieval while inactive. Consumers must use the retrieval function
or an equivalent owner/consent/state filter and must never query a raw profile table as context.

## RPC interface

| Operation | Input | Output | Errors / idempotency | Permission |
| --- | --- | --- | --- | --- |
| `create_memory_retrieval_consent` | none; ID is server-minted | ID, `granted`, `reused=false` | creates one new owner-scoped consent | verified owner JWT |
| `grant_memory_retrieval_consent` | existing owner consent UUID only | ID, status, reused | repeats an owner re-grant safely; unknown/other owner is `FORBIDDEN` | verified owner JWT |
| `revoke_memory_retrieval_consent` | consent UUID | ID, status, reused | unknown/other owner is `FORBIDDEN`; repeat revocation is safe | verified owner JWT |
| `create_explicit_memory_profile` | memory UUID, receipt UUID, granted consent UUID, `preference` or `hard_constraint`, 1–500 char summary | memory ID, `explicit`, reused | `CONSENT_REQUIRED`, `INVALID_MEMORY`, `MEMORY_ID_REUSE`; exact repeat is safe | verified owner JWT |
| `transition_memory_profile` | memory UUID, next lifecycle state | memory ID, state, reused | `FORBIDDEN`, `TERMINAL_MEMORY`, `INVALID_MEMORY_STATE`, `INVALID_MEMORY_TRANSITION`; same state is safe | verified owner JWT |
| `read_retrievable_memory_profiles` | none | ordered owner-only active profile rows | no cross-owner fallback | verified owner JWT under RLS |

All mutation RPCs are fixed `security definer` functions with `auth.uid()` checks, owner row locks,
and a restricted `search_path`. Authenticated callers receive `select` only on the three tables;
they cannot insert, update or delete rows directly. Anonymous access is fully revoked. `service_role`
is reserved for future worker-owned inference paths and remains outside this user-facing contract.
Initial consent IDs are generated only by the database. Client-provided UUIDs can only target a
known owner consent for re-grant or revoke, so an unowned UUID is indistinguishable from an absent
UUID at the mutation boundary.

## Version, rollback and verification

The database baseline is `v4-13-memory-profile-v1`, represented by migration
`20260828193000_v4_13_memory_profile.sql` and the additive V4-14 forward repair
`20260829191000_v4_14_server_minted_memory_consent.sql`; the pure projection type lives in
`lib/server/memory/profile.ts`. This is additive and has no existing consumer migration.

Rollback is a revert of the V4-13 code and migration before applying it to an environment. After an
environment applies it, use an explicit forward repair migration; do not drop potentially owned
memory or receipts. Local Supabase migration/RLS runtime evidence remains unrun until that runtime
is available. Contract and static security tests prove the frozen lifecycle and SQL boundary, not a
deployed data store.
