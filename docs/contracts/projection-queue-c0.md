# Projection Queue C0 contract

`createProjectionQueue({ phase: "r3" })` is a deterministic, process-local queue seam for pre-publication Fact invalidation, Retrieval projection, Explore projection, and embedding work. `r1` is rejected: it has no queue.

Jobs use a closed `{ jobId, kind, payloadVersion: 1, factId, now }` message. A matching duplicate job ID is idempotent; a changed payload conflicts. No source text, candidate data, user data, credential, or arbitrary payload enters the queue.

Workers claim a bounded future lease. Expired or crashed leases return to pending work, so delivery is at-least-once. The same lease holder alone can acknowledge. After three expired attempts the job moves to quarantine; an explicit opaque Ops operator identity can replay only a quarantined job, resetting its attempt count.

This is not a Supabase Queue/pgmq implementation, outbox, worker host, function deployment, poller, push subscription, database, RLS proof, durable audit, credential, production replay, public projection, or feature flag. Rollback is a source revert; no durable or external state exists.
