import assert from "node:assert/strict";
import test from "node:test";

import { createProjectionQueue } from "../../../lib/server/jobs/projection-queue.ts";

test("only the worker holding a lease can acknowledge a projection and prevent redelivery", () => {
  const queue = createProjectionQueue({ phase: "r3" });
  queue.enqueue({ jobId: "job-001", kind: "retrieval-projection", payloadVersion: 1, factId: "fact-001", now: "2026-08-28T00:00:00Z" });
  queue.claim({ workerId: "worker-001", now: "2026-08-28T00:00:00Z", leaseUntil: "2026-08-28T00:01:00Z" });
  assert.throws(() => queue.acknowledge({ workerId: "worker-002", jobId: "job-001", now: "2026-08-28T00:00:30Z" }), TypeError);
  queue.acknowledge({ workerId: "worker-001", jobId: "job-001", now: "2026-08-28T00:00:30Z" });
  assert.equal(queue.claim({ workerId: "worker-002", now: "2026-08-28T00:02:00Z", leaseUntil: "2026-08-28T00:03:00Z" }), null);
});
