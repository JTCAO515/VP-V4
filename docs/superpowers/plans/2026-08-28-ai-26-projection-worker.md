# AI-26 Projection Queue plan

**Objective:** Define the smallest C0 contract for a future single projection queue before Fact publication without enabling a worker, queue service, database, credential, public data or deployment.

**Scope:** Closed R3-only input, version-one job identity, idempotent duplicate behavior, lease claim/expiry, three-attempt quarantine, opaque Ops replay, consumer acknowledgement, RL-02 fixtures, contract, evidence and handoff.

**Anti-goals:** No pgmq/outbox/second queue, Supabase Function, poller, push transport, durable lease/audit, secret, account, RLS claim, raw payload, database, Fact publication, retrieval result, Explore result, embedding provider or feature flag.

**Acceptance:** R1 cannot create a queue; duplicate and crash paths are deterministic; expired third attempt quarantines; an operator replay resets a quarantined job; only the current lease holder acknowledges; no unbounded payload reaches the seam.

**Rollback:** Revert the isolated queue, tests, contract, evidence, handoff and plan. No durable, external or production state exists.
