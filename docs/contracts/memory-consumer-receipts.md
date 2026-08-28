# V4-15 Memory consumer receipt contract

**Owner:** Memory consumers (#100 / V4-15)
**Status:** implemented receipt schema and deterministic projection baseline; no persistent Turn/Proposal writer or visible Memory UI is claimed.
**Consumers:** a future accepted Turn writer and Proposal writer; Chat and Canvas read surfaces only after those writers persist an equivalent receipt.
**Non-consumers:** Demo fixtures, raw Memory tables, Copilot unavailable UI, provider/model payloads, and direct Trip mutation.

## Objective and boundary

`projectMemoryConsumerReceipts` derives the minimum audit reference for one owner-scoped `turn` or
`proposal` consumption. Every output carries only `memoryId`, immutable `sourceReceiptId`, consumer
kind/ID, and `constraintKind`. It intentionally excludes owner IDs, canonical summaries, prompt
text, artifact data, provider output and Trip content.

Inputs first pass the V4-13 `projectRetrievableMemory` boundary. Therefore only granted-consent
`explicit`/`confirmed` rows can produce receipts; `inferred`, `paused`, `rejected`, `deleted` and
revoked-consent rows never appear. Any supplied memory owned by someone else fails closed. Active
hard constraints sort before preferences, so a future consumer cannot silently let a preference
override one.

## Consumer contract

```ts
type MemoryConsumer = { kind: "turn" | "proposal"; id: string; ownerId: string };
type MemoryConsumerReceipt = {
  kind: "memory";
  consumerKind: "turn" | "proposal";
  consumerId: string;
  memoryId: string;
  sourceReceiptId: string;
  constraintKind: "preference" | "hard_constraint";
};
```

The function is pure and deterministic. A caller must invoke it at the same logical point that it
constructs a future immutable Turn or Proposal record, then persist the returned receipt atomically
with that owning record. A previously recorded receipt explains an historic result; it must not
make paused/rejected/revoked Memory eligible for a new result. V4-14 is the owner action surface
that changes lifecycle state; V4-15 never mutates it.

## Current maturity, rollback and verification

`memory_consumer_receipts` is an owner-RLS, append-only receipt table. Its composite foreign key
proves that the source receipt belongs to the recorded Memory and owner; exactly one Turn or Proposal
consumer is required. Anonymous and authenticated client writes are denied; only a future verified
coordinator may insert it atomically with its own immutable result. The current Chat control stores
only state events and no answer, while Canvas reads existing Trip versions; neither has that writer.
Consequently no UI is modified and this module must not be represented as visible durable consumption
or an impact screen. The synthetic eval proves active-to-paused/rejected propagation and privacy
projection. A later read owner must add a reload trace before exposing any receipt in Chat or Canvas.

Rollback before migration application is a normal revert. After application, use a forward repair
migration; do not drop owner receipt history. The module has no provider call or Trip write.
