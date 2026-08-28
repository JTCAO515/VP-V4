import assert from "node:assert/strict";
import test from "node:test";

import { CostGuard } from "../../../lib/server/model-gateway/budget/index.ts";

const config = { windowMs: 60_000, perUserAttempts: 2, perTaskAttempts: 1, turnDeadlineMs: 1_000, maxModelSteps: 2, maxToolSteps: 1 };
const turnRequest = (overrides = {}) => ({ userId: "user-1", taskId: "task-1", ...overrides });

function requireTurn(value: ReturnType<CostGuard["startTurn"]>) {
  assert.equal(value.kind, "turn");
  if (value.kind !== "turn") throw new Error("expected turn");
  return value;
}

test("exhausts per-task and per-user windows without accepting content", () => {
  const guard = new CostGuard(config, () => 100);
  const first = requireTurn(guard.startTurn(turnRequest()));
  assert.deepEqual(first.admitModelStep(), { kind: "admitted" });
  assert.deepEqual(first.admitModelStep(), { kind: "unavailable", code: "BUDGET_EXHAUSTED", metricLabel: "budget_exhausted" });
  assert.deepEqual(requireTurn(guard.startTurn(turnRequest({ taskId: "task-2" }))).admitModelStep(), { kind: "admitted" });
  assert.deepEqual(requireTurn(guard.startTurn(turnRequest({ taskId: "task-3" }))).admitModelStep(), { kind: "unavailable", code: "BUDGET_EXHAUSTED", metricLabel: "budget_exhausted" });
  assert.deepEqual(guard.startTurn({ ...turnRequest(), prompt: "must be rejected" }), { kind: "invalid" });
});

test("owns turn time and model/tool counts so they cannot be forged by a caller", () => {
  let now = 0;
  const deadlineGuard = new CostGuard({ ...config, perUserAttempts: 10, perTaskAttempts: 10 }, () => now);
  const expired = requireTurn(deadlineGuard.startTurn(turnRequest()));
  now = 1_001;
  assert.deepEqual(expired.admitModelStep(), { kind: "unavailable", code: "TIMEOUT_BEFORE_OUTPUT", metricLabel: "timeout_before_output" });

  const stepGuard = new CostGuard({ ...config, perUserAttempts: 10, perTaskAttempts: 10 }, () => 100);
  const turn = requireTurn(stepGuard.startTurn(turnRequest()));
  assert.deepEqual(turn.admitModelStep(), { kind: "admitted" });
  assert.deepEqual(turn.admitModelStep(), { kind: "admitted" });
  assert.deepEqual(turn.admitModelStep(), { kind: "unavailable", code: "BUDGET_EXHAUSTED", metricLabel: "budget_exhausted" });
  assert.deepEqual(turn.admitToolStep(), { kind: "admitted" });
  assert.deepEqual(turn.admitToolStep(), { kind: "unavailable", code: "BUDGET_EXHAUSTED", metricLabel: "budget_exhausted" });
});

test("fails closed when the server clock moves backward instead of resetting quota windows", () => {
  let now = 100;
  const guard = new CostGuard(config, () => now);
  assert.deepEqual(requireTurn(guard.startTurn(turnRequest())).admitModelStep(), { kind: "admitted" });
  now = 0;
  assert.deepEqual(guard.startTurn(turnRequest()), { kind: "invalid" });
});
