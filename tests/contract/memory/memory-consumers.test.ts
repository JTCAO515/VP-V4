import assert from "node:assert/strict";
import test from "node:test";
import { projectMemoryConsumerReceipts, type MemoryConsumer } from "../../../lib/server/memory/receipts.ts";
import type { MemoryProfile } from "../../../lib/server/memory/profile.ts";

const active: MemoryProfile = {
  id: "memory-active", ownerId: "actor-a", sourceReceiptId: "source-active", consentStatus: "granted",
  state: "confirmed", constraintKind: "preference", summary: "Avoid late-night arrivals.", updatedAt: "2026-08-28T00:00:00.000Z",
};

test("V4-15 creates privacy-safe receipts only for the owner-scoped active memory projection", () => {
  const consumer: MemoryConsumer = { kind: "turn", id: "turn-a", ownerId: "actor-a" };
  const result = projectMemoryConsumerReceipts(consumer, [
    active,
    { ...active, id: "paused", state: "paused" },
    { ...active, id: "rejected", state: "rejected" },
    { ...active, id: "revoked", consentStatus: "revoked" },
  ]);
  assert.deepEqual(result, [{ kind: "memory", consumerKind: "turn", consumerId: "turn-a", memoryId: "memory-active", sourceReceiptId: "source-active", constraintKind: "preference" }]);
  assert.equal(JSON.stringify(result).includes(active.summary ?? ""), false);
});

test("V4-15 rejects cross-owner consumption and gives active hard constraints precedence", () => {
  assert.throws(() => projectMemoryConsumerReceipts({ kind: "artifact", id: "artifact-a", ownerId: "actor-a" } as never, [active]), /consumer kind/i);
  assert.throws(() => projectMemoryConsumerReceipts({ kind: "proposal", id: "proposal-a", ownerId: "actor-b" }, [active]), /owner/i);
  const result = projectMemoryConsumerReceipts({ kind: "proposal", id: "proposal-a", ownerId: "actor-a" }, [
    active,
    { ...active, id: "hard", sourceReceiptId: "source-hard", state: "explicit", constraintKind: "hard_constraint" },
  ]);
  assert.deepEqual(result.map((receipt) => receipt.memoryId), ["hard", "memory-active"]);
});
