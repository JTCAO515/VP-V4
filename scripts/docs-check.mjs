import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const handoffPath = "docs/handoff.json";
const operatorActionsPath = "docs/operator-actions.json";
assert.equal(existsSync(handoffPath), true, `${handoffPath} must exist`);
assert.equal(existsSync(operatorActionsPath), true, `${operatorActionsPath} must exist`);
assert.equal(existsSync("docs/agents/issue-execution-contract.md"), true, "execution contract must exist");
assert.equal(existsSync("docs/agents/continuous-afk-execution.md"), true, "AFK policy must exist");
assert.equal(existsSync("docs/agents/prompts/continuous-afk-kickoff.md"), true, "AFK prompt must exist");
assert.equal(existsSync("docs/acceptance/release-acceptance-template.md"), true, "release acceptance template must exist");

const handoff = JSON.parse(readFileSync(handoffPath, "utf8"));
assert.equal(handoff.schemaVersion, "jtcoding-handoff/1.0");
assert.equal(typeof handoff.projectId, "string");
assert.equal(typeof handoff.currentPhase, "string");
assert.ok(Array.isArray(handoff.architectureContracts));

const operatorActions = JSON.parse(readFileSync(operatorActionsPath, "utf8"));
assert.equal(operatorActions.schemaVersion, "vp-v4-operator-actions/1.0");
assert.equal(operatorActions.policy, "docs/agents/continuous-afk-execution.md");
assert.ok(Array.isArray(operatorActions.actions));

for (const action of operatorActions.actions) {
  assert.equal(typeof action.id, "string");
  assert.equal(typeof action.issue, "number");
  assert.ok(["B", "C"].includes(action.class));
  assert.ok(["open", "done", "superseded"].includes(action.status));
  assert.equal(typeof action.createdAt, "string");
  assert.equal(typeof action.action, "string");
  assert.equal(typeof action.whyHuman, "string");
  assert.equal(typeof action.prerequisites, "string");
  assert.equal(typeof action.expectedResult, "string");
  assert.equal(typeof action.verify, "string");
  assert.equal(typeof action.dependencyEffect, "string");
  assert.equal(typeof action.rollback, "string");
  assert.equal(typeof action.nextSafeIssue, "number");
}

console.log("AI Core documentation baseline passed.");
