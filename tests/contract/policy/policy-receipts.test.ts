import assert from "node:assert/strict";
import test from "node:test";

import { createPolicyRegistry, evaluatePolicyDecision, revokePolicy } from "../../../lib/server/policy/receipts.ts";

const now = "2026-08-28T00:00:00.000Z";
const record = {
  policyId: "policy-public-fact-v1", sourceId: "source-official-v1", licenceVersion: "terms-2026-01", dataClass: "c0_public",
  grants: [{ field: "fact_summary", region: "cn-north", action: "display", purpose: "chat_answer" }],
  effectiveAt: "2026-01-01T00:00:00.000Z", expiresAt: "2026-12-31T00:00:00.000Z", termsRecheckAt: "2026-10-01T00:00:00.000Z", trialEndsAt: null,
  derivative: "allowed", shareAlike: "required", combination: "allowed", redistribution: "denied", training: "denied", retention: "ephemeral",
};
const request = { now, requestId: "request-policy-1", policyId: record.policyId, action: "display", purpose: "chat_answer", field: "fact_summary", region: "cn-north" };
const registry = (policy: unknown = record) => createPolicyRegistry({ policies: [policy] });

test("creates an immutable allow receipt only for one registered field-purpose-region-action grant", () => {
  const result = evaluatePolicyDecision(registry(), request);
  assert.equal(result.kind, "allowed");
  assert.equal(result.receipt.purpose, "chat_answer");
  assert.equal(result.receipt.shareAlike, "required");
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.receipt), true);
});

test("does not form an allowlist cartesian product across grants", () => {
  const policy = { ...record, grants: [
    { field: "seo_title", region: "cn-north", action: "display", purpose: "seo" },
    { field: "fact_summary", region: "cn-north", action: "llm_inference", purpose: "chat_answer" },
  ] };
  const result = evaluatePolicyDecision(registry(policy), request);
  assert.equal(result.kind, "denied");
  assert.equal(result.receipt.reason, "POLICY_ACTION_NOT_GRANTED");
});

test("enforces derivative, redistribution, and durable-retention grants separately from an atomic grant", () => {
  const cases = [
    { action: "translate", policy: { ...record, grants: [{ field: "fact_summary", region: "cn-north", action: "translate", purpose: "chat_answer" }], derivative: "denied" } },
    { action: "redistribute", policy: { ...record, grants: [{ field: "fact_summary", region: "cn-north", action: "redistribute", purpose: "chat_answer" }] } },
    { action: "persist", policy: { ...record, grants: [{ field: "fact_summary", region: "cn-north", action: "persist", purpose: "chat_answer" }] } },
  ];
  const results = cases.map(({ action, policy }) => evaluatePolicyDecision(registry(policy), { ...request, action }));
  assert.deepEqual(results.map((result) => result.receipt.reason), ["POLICY_ACTION_NOT_GRANTED", "POLICY_ACTION_NOT_GRANTED", "POLICY_ACTION_NOT_GRANTED"]);
});

test("revokes a registered policy so the exact prior request is denied after its cascade plan", () => {
  const current = registry();
  assert.equal(evaluatePolicyDecision(current, request).kind, "allowed");
  const plan = revokePolicy(current, { now, policyId: record.policyId, revokedAt: now, reason: "policy_revoked" });
  const after = evaluatePolicyDecision(current, request);
  const rebuiltView = evaluatePolicyDecision(registry(), request);
  assert.deepEqual(plan.invalidatedConsumers, ["cache", "rag", "explore", "seo", "new_proposal"]);
  assert.equal(after.receipt.reason, "POLICY_REVOKED");
  assert.equal(rebuiltView.receipt.reason, "POLICY_REVOKED");
});
