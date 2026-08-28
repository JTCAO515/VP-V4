# Copilot Memory governance contract v1

**Owner:** Copilot Memory Web (#99 / V4-14)
**Status:** implemented owner-JWT route and five-locale/RTL UI; local Supabase and browser-runtime
acceptance remain unrun.
**Dependencies consumed:** V4-13 Memory Profile RPC and V4-15 receipt read schema.

## Boundary

`GET /api/memory` reads only the authenticated owner's profiles, consent state, source receipt and
recorded Turn/Proposal receipt references. `POST /api/memory` creates an explicit bounded memory
through the V4-13 RPC. `POST /api/memory/consent` grants or revokes a consent UUID, and
`POST /api/memory/:id` performs exactly one V4-13 lifecycle transition.

All mutations require same-origin requests, closed input shapes and a verified Supabase user claim.
The browser never writes a Memory table directly, keeps no local/session copy, uses no service
credential, and reloads server state after a successful action. The page shows a truthful failure
state when a request fails; it does not optimistically claim confirmation, deletion or impact.

## Presentation and lifecycle

The surface displays the canonical summary only to its owner, plus source receipt, updated time,
retrieval-consent state and opaque impact references. It supports explicit creation, consent
grant/revoke, inferred confirmation, reject, pause, resume and forget/delete where the frozen
V4-13 lifecycle permits the action. A deleted profile remains a tombstone with no summary; V4-17,
not this route, owns privacy erasure and retention.

Recorded impact means an immutable V4-15 receipt already exists. It does not claim that current
state-only Turns or historical Trip versions have a writer: no current coordinator creates those
receipts, so empty impact lists and missing runtime traces remain expected.

## Rollback and verification

Before a database migration is applied, revert V4-14 normally. After V4-13/V4-15 migration
application, revert only the route/UI and use a forward repair for owned data; do not drop profiles,
consents or receipts. Static contract/security/E2E tests and `pnpm check` verify the code boundary.
Local Supabase migration/RLS and interactive browser persistence are explicitly unrun until a local
runtime is available.
