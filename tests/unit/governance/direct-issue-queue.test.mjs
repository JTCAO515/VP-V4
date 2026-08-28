import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(file, "utf8");
const tracker = read("docs/agents/issue-tracker.md");
const labels = read("docs/agents/triage-labels.md");
const contract = read("docs/agents/issue-execution-contract.md");
const identityContract = read("docs/contracts/user-data-adapter.md");
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

test("handoff and identity contract reflect anonymous preview without Magic Link", () => {
  assert.doesNotMatch(identityContract, /magic[ -]?link|\/api\/auth\/magic-link|\/auth\/callback/i);
  assert.match(identityContract, /anonymous preview/i);
  assert.match(identityContract, /auth\.getClaims\(\)/);
  assert.doesNotMatch(handoff.intendedNextAgent, /magic[ -]?link|dependency-blocked/i);
  assert.doesNotMatch(handoff.nextAction, /magic[ -]?link|keep .*blocked/i);
  assert.equal(handoff.lastUpdated, "2026-08-28");
});
