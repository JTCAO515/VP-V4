# AI-09 TripPatch Golden Contract

`TripPatch` is a closed union with `expectedVersion`; arbitrary JSON Patch paths are forbidden. The current fixture contract supports title and day upsert/delete, validates every operation, rejects stale versions, and deterministically returns a version-incremented snapshot with stable day ordering. It is a pure function only: CAS persistence, idempotency storage, audit, and proposal confirmation remain AI-10 ownership. RL-03 later requires this contract at the writer boundary.

Rollback: revert this contract; no database state or runtime Trip write exists.
