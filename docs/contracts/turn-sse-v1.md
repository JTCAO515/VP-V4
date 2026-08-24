# AI-06 Turn SSE v1

Fixture-only protocol contract. Every event has `turnId`, `eventId`, increasing `sequence`, and schema version `turn-sse-v1`. States only move `accepted -> planning -> retrieving -> generating -> validating -> terminal`; terminal is exactly one of `completed`, `proposal_ready`, `unavailable`, `failed`, or `cancelled`.

SSE may emit `accepted`, `phase`, `progress`, then only validated complete `answer`, `card`, or `proposal`, followed by a terminal event. It never emits provider token deltas or unvalidated JSON. Replay selects already-recorded events after `Last-Event-ID`/sequence and never re-invokes a model or tool.

An idempotency key with the same digest returns the original Turn; the same key with a different digest is a 409 `IDEMPOTENCY_KEY_REUSE` conflict. Cancellation produces the sole terminal `cancelled` event and prevents future events. Persistence, HTTP routes, and provider abort propagation are later owning work.

Rollback: revert this pure contract; no runtime Turn or provider call is introduced.
