import assert from "node:assert/strict";
import test from "node:test";
import { projectMemoryConsumerReceipts } from "../../lib/server/memory/receipts.ts";
import type { MemoryProfile } from "../../lib/server/memory/profile.ts";

const owner = "actor-a";
const memory = (id: string, state: MemoryProfile["state"], constraintKind: MemoryProfile["constraintKind"] = "preference"): MemoryProfile => ({
  id, ownerId: owner, sourceReceiptId: `source-${id}`, consentStatus: "granted", state, constraintKind,
  summary: state === "deleted" ? null : `private canonical summary for ${id}`, updatedAt: "2026-08-28T00:00:00.000Z",
});

test("V4-15 synthetic receipt trace retains active hard constraints and abstains after pause or rejection", () => {
  const initial = projectMemoryConsumerReceipts({ kind: "turn", id: "turn-1", ownerId: owner }, [
    memory("preference", "confirmed"), memory("hard", "explicit", "hard_constraint"),
  ]);
  const afterGovernance = projectMemoryConsumerReceipts({ kind: "turn", id: "turn-2", ownerId: owner }, [
    memory("preference", "paused"), memory("hard", "rejected", "hard_constraint"),
  ]);

  assert.deepEqual(initial.map((receipt) => receipt.memoryId), ["hard", "preference"]);
  assert.deepEqual(afterGovernance, []);
  assert.equal(JSON.stringify(initial).includes("private canonical summary"), false);
});
