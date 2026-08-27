# Pending Proposal Read Projection v1

Status: draft for [#126 AI-13a](https://github.com/JTCAO515/VP-V4/issues/126). This is an owner-scoped R1 Canvas read model, not a proposal writer or a Fact/evidence source.

`GET /api/trips/:tripId/proposal` authenticates the request, confirms the owner can read the Trip, then returns exactly one latest pending Proposal for that Trip. The projection contains immutable identifiers, revision/base-version, expiry, title before/after and the explicit `not_recorded` state for evidence and assumptions. It never fabricates provenance from a database row.

Anonymous requests return `UNAUTHENTICATED`; inaccessible Trip, another user, no pending proposal, expired proposal or malformed title patch never return a proposal projection. The result is `private, no-store`. This contract does not create, revise, select, confirm or mutate a Proposal.

Rollback removes the read route and adapter projection; it changes no row, migration, RLS policy or provider state.
