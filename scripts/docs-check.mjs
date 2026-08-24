import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const handoffPath = "docs/handoff.json";
assert.equal(existsSync(handoffPath), true, `${handoffPath} must exist`);
assert.equal(existsSync("docs/agents/issue-execution-contract.md"), true, "execution contract must exist");
assert.equal(existsSync("docs/acceptance/release-acceptance-template.md"), true, "release acceptance template must exist");

const handoff = JSON.parse(readFileSync(handoffPath, "utf8"));
assert.equal(handoff.schemaVersion, "jtcoding-handoff/1.0");
assert.equal(typeof handoff.projectId, "string");
assert.equal(typeof handoff.currentPhase, "string");
assert.ok(Array.isArray(handoff.architectureContracts));

console.log("AI Core documentation baseline passed.");
