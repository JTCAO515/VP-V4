# Privacy lifecycle execution runbook

## Current boundary

V4-17 creates an authenticated, owner-scoped export or delete request plus an
immutable `requested` receipt. It does not execute a data export or erasure.
The database has no function that deletes `user_profiles`, `memory_profiles`,
`trips`, `turns`, or any UserArtifact as part of this request path.

## Required future executor evidence

Before an executor may advance a request, its owner must provide all of the
following:

1. a closed inventory for Profile, Memory, Trip, Turn and UserArtifact source
   reads, including owner predicates and no provider/raw-payload expansion;
2. encrypted, owner-bound export delivery with an expiry and download audit;
3. an ordered deletion plan, retry/idempotency rules and an immutable terminal
   receipt; and
4. backup and replica retention terms, a verified expiry observation and a
   rollback/incident procedure.

Until then, do not tell a user that an export is ready, data was deleted, or a
backup has been purged. Local Supabase execution, authenticated cross-owner
runtime probes, export delivery, deletion and backup expiry are all unrun.

## Rollback

Revert the V4-17 application and migration preparation. Because no product row
is exported or erased, no data repair is required.
