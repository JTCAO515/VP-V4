import assert from "node:assert/strict";
import test from "node:test";

import { createProjectionQueue } from "../../../lib/server/jobs/projection-queue.ts";

const start = "2026-08-28T00:00:00.000Z";
const lease = "2026-08-28T00:01:00.000Z";
const afterLease = "2026-08-28T00:02:00.000Z";
const job = { jobId: "job-001", kind: "fact-invalidation" as const, payloadVersion: 1 as const, factId: "fact-001", now: start };

test("RL-02 rejects a queue before R3 and old payload versions", () => {
  assert.throws(() => createProjectionQueue({ phase: "r1" }), TypeError);
  const queue = createProjectionQueue({ phase: "r3" });
  assert.throws(() => queue.enqueue({ ...job, payloadVersion: 0 }), TypeError);
  assert.deepEqual(queue.snapshot(), { pending: [], leased: [], quarantined: [] });
});

test("RL-02 coalesces an identical delivery and rejects a conflicting duplicate", () => {
  const queue = createProjectionQueue({ phase: "r3" });
  const first = queue.enqueue(job);
  assert.equal(queue.enqueue(job).jobId, first.jobId);
  assert.throws(() => queue.enqueue({ ...job, factId: "fact-002" }), TypeError);
  assert.equal(queue.snapshot().pending.length, 1);
});

test("RL-02 re-delivers a crashed or expired lease at-least-once", () => {
  const queue = createProjectionQueue({ phase: "r3" });
  queue.enqueue(job);
  const first = queue.claim({ workerId: "worker-001", now: start, leaseUntil: lease });
  assert.equal(first?.attempt, 1);
  const retry = queue.claim({ workerId: "worker-002", now: afterLease, leaseUntil: "2026-08-28T00:03:00.000Z" });
  assert.deepEqual(retry, { jobId: "job-001", kind: "fact-invalidation", payloadVersion: 1, factId: "fact-001", attempt: 2 });
});

test("RL-02 quarantines poison work after the maximum attempts and supports explicit Ops replay", () => {
  const queue = createProjectionQueue({ phase: "r3" });
  queue.enqueue(job);
  queue.claim({ workerId: "worker-001", now: start, leaseUntil: lease });
  queue.claim({ workerId: "worker-001", now: afterLease, leaseUntil: "2026-08-28T00:03:00.000Z" });
  queue.claim({ workerId: "worker-001", now: "2026-08-28T00:04:00.000Z", leaseUntil: "2026-08-28T00:05:00.000Z" });
  assert.equal(queue.claim({ workerId: "worker-001", now: "2026-08-28T00:06:00.000Z", leaseUntil: "2026-08-28T00:07:00.000Z" }), null);
  assert.deepEqual(queue.snapshot().quarantined, [{ jobId: "job-001", attempts: 3, reason: "max-attempts" }]);
  assert.throws(() => queue.replay({ operatorId: "", jobId: "job-001", now: "2026-08-28T00:06:00.000Z" }), TypeError);
  queue.replay({ operatorId: "ops-001", jobId: "job-001", now: "2026-08-28T00:06:00.000Z" });
  assert.equal(queue.claim({ workerId: "worker-002", now: "2026-08-28T00:06:01.000Z", leaseUntil: "2026-08-28T00:07:00.000Z" })?.attempt, 1);
});
