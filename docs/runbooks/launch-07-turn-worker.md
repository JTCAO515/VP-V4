# LAUNCH-07 worker runbook preparation

No worker process, queue, Provider or Staging deployment is configured by this change. Do not run a
real worker or promote a fake coordinator through a live flag.

Before a Staging rehearsal, the future owner must provide durable queue/lease semantics, verified
worker identity, actor/RLS enforcement, one approved Provider, content-free telemetry, a bounded
concurrency/budget configuration, and a documented rollback. The Staging rehearsal must prove one
duplicate delivery, worker crash, lease expiry, cancellation race, provider failure, validation
failure, replay, owner isolation and no Trip write on each failed path. Record only redacted
outcomes; never copy content, identifiers, keys, cookies or connection strings into evidence.

If a future coordinator duplicates a request or bypasses owner scope, disable its approved worker/chat
flags, stop new claims, retain durable accepted state for inspection, and use the accepted recovery
procedure. Production action remains operator-owned.
