import assert from "node:assert/strict";
import test from "node:test";

import {
  ReliableTurnCoordinator,
  TurnCoordinatorAccessError,
  createTurnWorkerCapability,
} from "../../../lib/server/turn/reliable-coordinator.ts";

const owner = "11111111-1111-4111-8111-111111111111";
const otherOwner = "22222222-2222-4222-8222-222222222222";

test("LAUNCH-07 rejects content-bearing input, forged worker/lease capabilities, and cross-owner reads", () => {
  const coordinator = new ReliableTurnCoordinator({ leaseMs: 10, maxAttempts: 1 }, () => 100);
  assert.throws(() => coordinator.enqueue({ turnId: "turn-1", ownerId: owner, prompt: "never persist" } as never));
  coordinator.enqueue({ turnId: "turn-1", ownerId: owner });
  assert.equal(coordinator.claim({} as never), null);
  const worker = createTurnWorkerCapability();
  const lease = coordinator.claim(worker);
  assert.ok(lease);
  assert.deepEqual(coordinator.finish(worker, {} as never, { outcome: "completed" }), { state: "invalid", attempt: 0, terminal: false });
  assert.deepEqual(coordinator.finish(createTurnWorkerCapability(), lease, { outcome: "completed" }), { state: "invalid", attempt: 0, terminal: false });
  assert.throws(() => coordinator.read({ turnId: "turn-1", ownerId: otherOwner }), TurnCoordinatorAccessError);
});

test("LAUNCH-07 owner cancellation wins a lease race and prevents a later worker completion", () => {
  const coordinator = new ReliableTurnCoordinator({ leaseMs: 10, maxAttempts: 1 }, () => 100);
  const worker = createTurnWorkerCapability();
  coordinator.enqueue({ turnId: "turn-1", ownerId: owner });
  const lease = coordinator.claim(worker);
  assert.ok(lease);
  assert.deepEqual(coordinator.cancel({ turnId: "turn-1", ownerId: owner }), { state: "cancelled", attempt: 1, terminal: true });
  assert.deepEqual(coordinator.finish(worker, lease, { outcome: "completed" }), { state: "cancelled", attempt: 1, terminal: true });
});

test("LAUNCH-07 expires a lease before an old worker can complete without an intervening claim", () => {
  let now = 100;
  const coordinator = new ReliableTurnCoordinator({ leaseMs: 10, maxAttempts: 2 }, () => now);
  const worker = createTurnWorkerCapability();
  coordinator.enqueue({ turnId: "turn-1", ownerId: owner });
  const lease = coordinator.claim(worker);
  assert.ok(lease);
  now = 110;
  assert.deepEqual(coordinator.finish(worker, lease, { outcome: "completed" }), { state: "queued", attempt: 1, terminal: false });
  const retry = coordinator.claim(worker);
  assert.ok(retry);
  assert.equal(retry.attempt, 2);
});
