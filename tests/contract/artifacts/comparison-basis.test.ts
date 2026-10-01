import test from "node:test";
import assert from "node:assert/strict";
import { comparisonBasisFacts } from "../../../components/canvas/comparison-basis.ts";
import type { ResultArtifactRead } from "../../../lib/server/artifacts/result-contract.ts";
const record = { source: { taskId: "DO_NOT_INFER_TASK_TITLE", taskTurnId: "TURN", goalId: "GOAL", goalVersion: 3,
  inputMessageId: "MESSAGE", inputSequence: 7, tripId: "TRIP", tripVersion: 2 }, basis: { memories: [], evidence: [] } } as Pick<ResultArtifactRead, "source" | "basis">;
test("basis copy uses recorded versions/counts and explicitly leaves contents, causes and evidence freshness unknown", () => {
  for (const zh of [true, false]) {
    const zero = comparisonBasisFacts(record, zh);
    assert.match(zero.trip, /v2/); assert.match(zero.request, /7/);
    assert.equal(zero.memory, zh ? "未记录记忆引用。" : "No Memory references were recorded.");
    assert.match(zero.evidence, zh ? /无法说明/ : /unknown/);
    assert.match(zero.explanation, zh ? /没有说明/ : /does not provide/);
    assert.match(zero.currentness, zh ? /此次读取.*刷新/ : /This read.*refresh/);
    assert.doesNotMatch(JSON.stringify(zero), /DO_NOT_INFER_TASK_TITLE|TURN|GOAL|MESSAGE|TRIP/);
    const two = comparisonBasisFacts({ ...record, basis: { memories: [{ id: "PREFER_RAIL_DO_NOT_GUESS", revision: 1 }, { id: "BUDGET_DO_NOT_GUESS", revision: 4 }], evidence: [] } }, zh);
    assert.match(two.memory, /2/); assert.match(two.memory, /v1/); assert.match(two.memory, /v4/);
    assert.doesNotMatch(JSON.stringify(two), /PREFER_RAIL|BUDGET/);
  }
});
