import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(file, "utf8");
const tracker = read("docs/agents/issue-tracker.md");
const labels = read("docs/agents/triage-labels.md");
const contract = read("docs/agents/issue-execution-contract.md");
const identityContract = read("docs/contracts/user-data-adapter.md");
const handoff = JSON.parse(read("docs/handoff.json"));

test("VPJ scheduling requires dependencies, a baseline and an execution row", () => {
  assert.match(tracker, /Native dependencies and\s+the baseline PR gate implementation/i);
  assert.match(labels, /Native dependencies and the baseline PR gate implementation/i);
  assert.match(contract, /Native dependencies and the baseline PR gate implementation/i);
  assert.match(handoff.status, /VPJ-00 #187/);
  assert.doesNotMatch(tracker, /dependencies.*do not prohibit implementation/i);
});

test("VPJ scheduling retains fail-closed runtime protections", () => {
  assert.match(tracker, /UNAUTHENTICATED.*SAFETY_BLOCKED.*DATA_POLICY_BLOCKED/is);
  assert.match(contract, /runtime.*fail-closed/i);
});

test("handoff and identity contract reflect anonymous preview without Magic Link", () => {
  assert.match(identityContract, /no Magic Link or callback session-acquisition route/i);
  assert.doesNotMatch(identityContract, /\/api\/auth\/magic-link|\/auth\/callback/i);
  assert.match(identityContract, /anonymous preview/i);
  assert.match(identityContract, /auth\.getClaims\(\)/);
  assert.doesNotMatch(handoff.intendedNextAgent, /magic[ -]?link|dependency-blocked/i);
  assert.doesNotMatch(handoff.nextAction, /magic[ -]?link|keep .*blocked/i);
  assert.match(handoff.lastUpdated, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(
    Date.parse(`${handoff.lastUpdated}T00:00:00Z`) >= Date.parse("2026-08-28T00:00:00Z"),
    "handoff.lastUpdated must not regress before the anonymous-preview baseline",
  );
});
