import assert from "node:assert/strict";
import test from "node:test";
import { approvalDigestForToolIntent, ToolGatewayError, ToolRegistry, executeToolIntent, type ToolDataClass, type ToolDefinition } from "../../../lib/server/tools/index.ts";

const definition: ToolDefinition<{ readonly cityId: string }, { readonly summary: string }> = {
  id: "evidence.city-summary", version: "v1", description: "Return one normalized city evidence summary.", riskClass: "R1_read_only",
  allowedTaskProfiles: ["information_lookup"], allowedDataClasses: ["public_evidence"], requiredLicenseScopes: ["public_evidence"], requiresApproval: false,
  idempotency: "required", timeoutMs: 1_000, retryPolicy: "never", maxModelOutputTokens: 256, featureFlag: "tool-evidence-city-summary",
  validateInput: (input): input is { readonly cityId: string } => typeof input === "object" && input !== null && typeof (input as { cityId?: unknown }).cityId === "string",
  validateOutput: (output): output is { readonly summary: string } => typeof output === "object" && output !== null && typeof (output as { summary?: unknown }).summary === "string",
};

const actor = { id: "actor-a", taskProfile: "information_lookup" as const, dataClasses: ["public_evidence"] as const, licensedScopes: ["public_evidence"] as const, enabledFeatureFlags: [definition.featureFlag] as const, approvals: [] as const };
const intent = (callId: string, input: unknown = { cityId: "shanghai" }, dataClasses: readonly ToolDataClass[] = ["public_evidence"]) => ({ source: "model" as const, callId, toolId: definition.id, dataClasses, input });
const now = () => "2026-08-28T00:00:00.000Z";

test("executes only an allowlisted policy-valid intent and returns no raw output", async () => {
  const receipt = await executeToolIntent({ registry: new ToolRegistry([definition]), intent: intent("call-1"), actor, execute: async () => ({ summary: "Shanghai evidence." }), now });
  assert.match(receipt.modelSafeProjection, /Shanghai evidence/);
  assert.equal("output" in receipt, false);
});

test("rejects unknown, feature-disabled, license-invalid, and sensitive active intent data before execution", async () => {
  let calls = 0; const registry = new ToolRegistry([definition]); const execute = async () => { calls += 1; return { summary: "unexpected" }; };
  await assert.rejects(() => executeToolIntent({ registry, intent: { ...intent("call-2"), toolId: "unknown.tool" }, actor, execute, now }), ToolGatewayError);
  await assert.rejects(() => executeToolIntent({ registry, intent: intent("call-3"), actor: { ...actor, enabledFeatureFlags: [] }, execute, now }), /disabled/i);
  await assert.rejects(() => executeToolIntent({ registry, intent: intent("call-4"), actor: { ...actor, licensedScopes: [] }, execute, now }), /license/i);
  await assert.rejects(() => executeToolIntent({ registry, intent: intent("call-5", { cityId: "shanghai", media: "secret" }, ["sensitive_media"]), actor: { ...actor, dataClasses: ["public_evidence", "sensitive_media"] }, execute, now }), /intent data/i);
  assert.equal(calls, 0);
});

test("rejects unsafe registration and external/proposal execution until typed persistent capabilities exist", () => {
  assert.throws(() => new ToolRegistry([{ ...definition, id: `evidence.${"a".repeat(100)}` }]), ToolGatewayError);
  assert.throws(() => new ToolRegistry([{ ...definition, version: "v1\"><instruction>inject</instruction>" }]), ToolGatewayError);
  assert.throws(() => new ToolRegistry([{ ...definition, maxModelOutputTokens: Infinity }]), ToolGatewayError);
  assert.throws(() => new ToolRegistry([{ ...definition, riskClass: "P_proposal_producing" }]), ToolGatewayError);
  assert.throws(() => new ToolRegistry([{ ...definition, id: "external.disabled", riskClass: "X_external_side_effect", requiresApproval: true }]), ToolGatewayError);
});

test("requires a non-expired actor/call/source-bound approval when a registered tool needs approval", async () => {
  const protectedTool = { ...definition, id: "evidence.approved-read", requiresApproval: true }; const call = { ...intent("call-approved"), toolId: protectedTool.id };
  const approval = { actorId: actor.id, callId: call.callId, source: call.source, taskProfile: actor.taskProfile, dataClasses: actor.dataClasses, inputDigest: approvalDigestForToolIntent(protectedTool, call.input), expiresAt: "2026-08-29T00:00:00.000Z" };
  await executeToolIntent({ registry: new ToolRegistry([protectedTool]), intent: call, actor: { ...actor, approvals: [approval] }, execute: async () => ({ summary: "ok" }), now });
  await assert.rejects(() => executeToolIntent({ registry: new ToolRegistry([protectedTool]), intent: call, actor: { ...actor, id: "actor-b", approvals: [approval] }, execute: async () => ({ summary: "unexpected" }), now }), /approval/i);
});

test("rejects replay, releases definite read failures, times out reads, and counts the final projection budget", async () => {
  const registry = new ToolRegistry([definition]); const request = { registry, intent: intent("call-replay"), actor, now };
  await executeToolIntent({ ...request, execute: async () => ({ summary: "ok" }) });
  await assert.rejects(() => executeToolIntent({ ...request, execute: async () => ({ summary: "replay" }) }), /already executed/i);
  const retry = { ...request, intent: intent("call-retry") };
  await assert.rejects(() => executeToolIntent({ ...retry, execute: async () => { throw new Error("provider unavailable"); } }));
  await executeToolIntent({ ...retry, execute: async () => ({ summary: "recovered" }) });
  const short = { ...definition, id: "evidence.short", timeoutMs: 5, maxModelOutputTokens: 1 };
  await assert.rejects(() => executeToolIntent({ registry: new ToolRegistry([short]), intent: { ...intent("call-timeout"), toolId: short.id }, actor, execute: async () => new Promise<{ summary: string }>((resolve) => setTimeout(() => resolve({ summary: "late" }), 25)), now }), /deadline/i);
  await assert.rejects(() => executeToolIntent({ registry: new ToolRegistry([short]), intent: { ...intent("call-budget"), toolId: short.id }, actor, execute: async () => ({ summary: "{}" }), now }), /budget/i);
});
