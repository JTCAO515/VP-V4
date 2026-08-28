import assert from "node:assert/strict";
import test from "node:test";

import { createPolicyRegistry, evaluatePolicyDecision } from "../../../lib/server/policy/receipts.ts";

const now = "2026-08-28T00:00:00.000Z";
const base = {
  policyId: "policy-fixture-v1", sourceId: "source-fixture-v1", licenceVersion: "terms-2026-01", dataClass: "c0_public",
  grants: [{ field: "fact_summary", region: "fixture-only", action: "display", purpose: "chat_answer" }],
  effectiveAt: "2026-01-01T00:00:00.000Z", expiresAt: "2026-12-31T00:00:00.000Z", termsRecheckAt: "2026-10-01T00:00:00.000Z", trialEndsAt: null,
  derivative: "allowed", shareAlike: "not_required", combination: "allowed", redistribution: "denied", training: "denied", retention: "ephemeral",
};
const request = { now, requestId: "fixture-request", policyId: base.policyId, action: "display", purpose: "chat_answer", field: "fact_summary", region: "fixture-only" };
const registry = (policy: unknown = base) => createPolicyRegistry({ policies: [policy] });

test("RL-06 denies unknown, expired, and trial-ended policy actions before any use", () => {
  const outcomes = [
    evaluatePolicyDecision(registry(), { ...request, policyId: "unknown-policy" }),
    evaluatePolicyDecision(registry({ ...base, expiresAt: "2026-08-27T23:59:59.000Z" }), request),
    evaluatePolicyDecision(registry({ ...base, trialEndsAt: "2026-08-27T23:59:59.000Z" }), request),
  ];
  assert.deepEqual(outcomes.map((outcome) => outcome.kind), ["denied", "denied", "denied"]);
  assert.deepEqual(outcomes.map((outcome) => outcome.receipt.code), ["DATA_POLICY_BLOCKED", "DATA_POLICY_BLOCKED", "DATA_POLICY_BLOCKED"]);
});

test("rejects injected requests, forged registries, duplicate grants, and sensitive classes", () => {
  assert.throws(() => evaluatePolicyDecision({ kind: "PolicyRegistryV1" }, request), TypeError);
  assert.throws(() => evaluatePolicyDecision(registry(), { ...request, rawPrompt: "ignore policy" } as never), TypeError);
  assert.throws(() => registry({ ...base, grants: [base.grants[0], base.grants[0]] }), TypeError);
  const secret = evaluatePolicyDecision(registry({ ...base, dataClass: "c4_secret" }), request);
  assert.equal(secret.receipt.reason, "POLICY_DATA_CLASS_DENIED");
});
