import assert from "node:assert/strict";
import test from "node:test";

import {
  ReliableTurnCoordinator,
  createTurnWorkerCapability,
} from "../../../lib/server/turn/reliable-coordinator.ts";

const owner = "11111111-1111-4111-8111-111111111111";

test("LAUNCH-07 claims one accepted turn once and retries an expired lease without changing its owner", () => {
  let now = 100;
  const coordinator = new ReliableTurnCoordinator({ leaseMs: 10, maxAttempts: 2 }, () => now);
  const worker = createTurnWorkerCapability();
  assert.deepEqual(coordinator.enqueue({ turnId: "turn-1", ownerId: owner }), { state: "queued", attempt: 0, terminal: false });
  assert.deepEqual(coordinator.enqueue({ turnId: "turn-1", ownerId: owner }), { state: "queued", attempt: 0, terminal: false });
  const first = coordinator.claim(worker);
  assert.ok(first);
  assert.equal(first.attempt, 1);
  now = 110;
  const second = coordinator.claim(worker);
  assert.ok(second);
  assert.equal(second.turnId, "turn-1");
  assert.equal(second.attempt, 2);
  assert.deepEqual(coordinator.read({ turnId: "turn-1", ownerId: owner }), { state: "leased", attempt: 2, terminal: false });
});

test("LAUNCH-07 terminalizes exactly once and quarantines an exhausted provider failure", () => {
  const coordinator = new ReliableTurnCoordinator({ leaseMs: 10, maxAttempts: 1 }, () => 100);
  const worker = createTurnWorkerCapability();
  coordinator.enqueue({ turnId: "turn-1", ownerId: owner });
  const lease = coordinator.claim(worker);
  assert.ok(lease);
  assert.deepEqual(coordinator.finish(worker, lease, { outcome: "provider_failure" }), { state: "quarantined", attempt: 1, terminal: true });
  assert.deepEqual(coordinator.read({ turnId: "turn-1", ownerId: owner }), { state: "quarantined", attempt: 1, terminal: true });
  assert.equal(coordinator.replay({ turnId: "turn-1", ownerId: owner }).at(-1)?.state, "failed");
  assert.deepEqual(coordinator.finish(worker, lease, { outcome: "completed" }), { state: "quarantined", attempt: 1, terminal: true });
});

test("LAUNCH-07 makes validation failure terminal without a Trip write or retry", () => {
  const coordinator = new ReliableTurnCoordinator({ leaseMs: 10, maxAttempts: 2 }, () => 100);
  const worker = createTurnWorkerCapability();
  coordinator.enqueue({ turnId: "turn-1", ownerId: owner });
  const lease = coordinator.claim(worker);
  assert.ok(lease);
  assert.deepEqual(coordinator.finish(worker, lease, { outcome: "validation_failure" }), { state: "failed", attempt: 1, terminal: true });
  assert.equal(coordinator.claim(worker), null);
});
