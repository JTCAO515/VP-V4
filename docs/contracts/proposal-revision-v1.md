# Proposal Revision v1

Status: draft for [#127 AI-13b](https://github.com/JTCAO515/VP-V4/issues/127). This contract creates a durable owner-only child revision; it does not permit a direct Trip write.

`POST /api/trips/:tripId/proposal/revision` accepts a same-origin, authenticated owner request with a pending Proposal ID and a bounded title. The transaction locks the parent, verifies owner/Trip/base-version/expiry, inserts one child with `parent_proposal_id`, then marks the parent `superseded`. Parent content remains immutable; only the lifecycle status changes.

The exact returned child remains pending until the existing confirm route applies it. Wrong owner, stale version, expired parent, non-pending parent, invalid title and replay attempts fail through the frozen taxonomy. The route returns `private, no-store` and never exposes a service credential.

Rollback reverts the migration and route together only after confirming no child revisions remain. It does not delete accepted Trip/audit history.
