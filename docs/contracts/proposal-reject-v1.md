# Proposal Reject v1

Status: draft for [#130 AI-13c](https://github.com/JTCAO515/VP-V4/issues/130). This contract records an owner decision to reject an exact pending Proposal; it never writes the Trip.

`POST /api/trips/:tripId/proposal/reject` accepts a same-origin authenticated request with one Proposal UUID. The UserDataAdapter verifies the visible owner Proposal belongs to the route Trip, is still pending and has not expired, then performs one owner-JWT/RLS update to `rejected` with a pending-state compare.

Anonymous, another user, wrong Trip, expired, superseded, applied or replay attempts return frozen failure states without row or database-error disclosure. The result is `private, no-store`.

Rollback removes the route and adapter method. Existing rejected Proposal history is retained; no migration or data deletion is required.
