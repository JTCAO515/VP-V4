import assert from "node:assert/strict";
import test from "node:test";

import {
  ReliableTurnCoordinator,
  createTurnWorkerCapability,
} from "../../../lib/server/turn/reliable-coordinator.ts";

const owner = "11111111-1111-4111-8111-111111111111";

test("LAUNCH-07 retries a provider failure once, then completes without a Trip write channel", () => {
  const coordinator = new ReliableTurnCoordinator({ leaseMs: 10, maxAttempts: 2 }, () => 100);
  const worker = createTurnWorkerCapability();
  coordinator.enqueue({ turnId: "turn-1", ownerId: owner });
  const first = coordinator.claim(worker);
  assert.ok(first);
  assert.deepEqual(coordinator.finish(worker, first, { outcome: "provider_failure" }), { state: "queued", attempt: 1, terminal: false });
  const second = coordinator.claim(worker);
  assert.ok(second);
  assert.deepEqual(coordinator.finish(worker, second, { outcome: "completed" }), { state: "completed", attempt: 2, terminal: true });
  assert.equal("applyTripPatch" in coordinator, false);
});
