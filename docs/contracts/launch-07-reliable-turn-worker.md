# LAUNCH-07 reliable Turn worker preparation

## Status and boundary

This is an in-memory, repository-only lifecycle contract. It does not read or retain a message,
call a Provider, read an environment value, use a credential, persist a row, run a queue host, write
a Trip, expose an API, or claim that a production coordinator is live.

## Closed lifecycle

`ReliableTurnCoordinator` accepts only a Turn ID and owner UUID. It emits an internal accepted/phase
and terminal event log, but exposes only the owner-scoped state, attempt count, and terminal flag.
The state transitions are `queued -> leased -> completed|failed|cancelled|quarantined`; a provider
failure returns to `queued` only while attempts remain. An expired lease follows the same rule, and
the exhausted state becomes terminal `quarantined`. Its compatible closed SSE terminal state is
`failed`, while the owner-scoped coordinator state retains `quarantined` as the non-content reason.
Validation failure is terminal `failed`.

Worker and lease values are process-local WeakSet/WeakMap capabilities. A lease is bound to the exact
server-issued worker capability that claimed it. Forged values, another worker's lease, content-bearing
enqueue input, malformed owner scope, and cross-owner reads fail closed. Cancellation immediately
wins a race: a subsequent completion from its genuine old lease returns the recorded cancelled state
without changing it. The contract has no Trip write method or provider result/output field.

## Verification and deferred acceptance

Deterministic tests cover duplicate enqueue, expiry before stale completion, provider
retry/quarantine, validation and completion terminals, cancellation race, capability forgery, worker
binding, owner isolation, the quarantine-to-`failed` event mapping, and absence of a Trip-write
channel. They use no model, content, user database, or runtime queue.

Still required: durable claim/lease storage, verified worker authentication, actor-scoped context,
provider transport and validation, durable event append/replay, provider cancellation propagation,
bounded real concurrency, RLS, crash recovery, Staging fault injection, and browser SSE evidence.
LAUNCH-06 Provider approval and LAUNCH-02 Staging configuration remain external gates.

Rollback is a normal revert of this module, its tests and docs. No queue job, provider request, user
content, Trip, database, account, deployment, or external state exists to compensate.
