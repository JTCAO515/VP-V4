import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(file, "utf8");
const tracker = read("docs/agents/issue-tracker.md");
const labels = read("docs/agents/triage-labels.md");
const contract = read("docs/agents/issue-execution-contract.md");
const handoff = JSON.parse(read("docs/handoff.json"));

test("defined Issues are directly schedulable without dependency closure", () => {
  assert.match(tracker, /defined Issue.*directly schedulable/i);
  assert.match(labels, /does not prohibit development/i);
  assert.match(contract, /Do not defer implementation solely because another Issue is\s+open/i);
  assert.match(handoff.status, /direct Issue queue/i);
});

test("direct scheduling retains fail-closed runtime protections", () => {
  assert.match(tracker, /UNAUTHENTICATED.*SAFETY_BLOCKED.*DATA_POLICY_BLOCKED/is);
  assert.match(contract, /runtime.*fail-closed/i);
});
