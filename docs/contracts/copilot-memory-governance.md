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
The browser never writes a Memory table directly, keeps no persistent local/session copy, uses no service
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

## Explicit create success and Undo (VPJ-11 increment)

`create_explicit_memory_profile_v2` wraps the existing owner-scoped create RPC and returns the
new Memory row's source receipt and monotonic revision. The Web page shows a zh/en top toast only
after the first acknowledged result for that create operation and a same-owner readback of the
same source, revision, explicit state and granted consent; an
identical replay can provide the first acknowledgment but never creates a second toast. The toast has one Undo action and
normally hides after four seconds; a focused or hovered control or pending Undo defers hiding. It displays
no memory summary by default, makes no model call and does not auto-save inferred content.
Both new definer RPCs check the current mobile session at entry, including replay branches that
could return without a table write. The create wrapper also locks and rechecks the current
Profile state and retrieval consent before acknowledging the write.

`undo_explicit_memory_create_v1` tombstones exactly the newly created `explicit` revision after
checking owner, source receipt and revision under a row lock. Its operation UUID is also the
deletion receipt ID so an identical retry can report an already completed Undo. Any later
Memory transition increments the row revision; stale Undo returns `MEMORY_CONFLICT` and cannot
erase newer work. Undo changes no Trip and never revives a revoked consent. The existing
management transition and old create RPC remain wire-compatible; this first increment has no
summary-update Undo. Cross-account refresh clears the old toast and operation entry; an unknown
network result retains the same Undo operation for retry rather than claiming success.
The page sends its last verified owner ID with consent/create requests as a rejection condition;
the server compares it with the current cookie-authenticated actor before any RPC write. This
client value never grants access or replaces `auth.uid()`/RLS.
If readback shows a later change, the page reports the current-state conflict without an Undo
entry. GET keeps its array body for existing clients, adds a revision per profile, and sends the
authenticated owner in a private, no-store header solely for this UI check.
If the target database has not yet received the additive migration, GET falls back only for
the exact missing `memory_profiles.revision` column and keeps the old list body with a null
revision. Create falls back only for PostgREST `PGRST202` naming the v2 RPC unavailable in its
schema cache, using the existing owner-scoped create RPC and returning `undoAvailable: false`;
the page then keeps the
old save-and-reload behavior without an Undo toast. Permission, consent, validation and other
database errors never trigger this fallback. [PostgREST's error codes](https://docs.postgrest.org/en/v12/references/errors.html)
distinguish missing function `PGRST202` from other failures. This compatibility path does not
claim migration application or target-environment acceptance.

This is repository behavior until the additive migration is applied and a real owner session,
browser timing, retry and account switch have been observed in the named target environment.
Rollback the new route/UI and v2 create caller if needed; after migration application retain
the revision column, tombstones and receipt history. Do not lower versions or restore consent.

## Rollback and verification

Before a database migration is applied, revert V4-14 normally. After V4-13/V4-15 migration
application, revert only the route/UI and use a forward repair for owned data; do not drop profiles,
consents or receipts. Static contract/security/E2E tests and `pnpm check` verify the code boundary.
Local Supabase migration/RLS and interactive browser persistence are explicitly unrun until a local
runtime is available.
