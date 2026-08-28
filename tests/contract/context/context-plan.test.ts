import assert from "node:assert/strict";
import test from "node:test";

import { ContextPlanError, createContextPlan } from "../../../lib/server/context/index.ts";

test("creates a high-risk trip plan with stable required boundaries and no tools", () => {
  const plan = createContextPlan({ taskProfile: "trip_planning", riskClass: "high" });

  assert.deepEqual(plan.sectionOrder, [
    "system",
    "policy",
    "constraints",
    "trip",
    "proposal",
    "memory",
    "evidence",
    "tool",
    "thread",
    "user_message",
  ]);
  assert.deepEqual(plan.policy.requiredSources, ["system", "policy", "constraints", "user_message"]);
  assert.equal(plan.policy.maxToolDefinitions, 0);
  assert.equal(plan.policy.includeRawUserArtifact, false);
  assert.equal(plan.policy.compactionVersion, "context-compaction-v1");
});

test("rejects a task profile outside the frozen ContextPlan contract", () => {
  assert.throws(
    () => createContextPlan({ taskProfile: "unbounded_agent" as never, riskClass: "low" }),
    ContextPlanError,
  );
});
