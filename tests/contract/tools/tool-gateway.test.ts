import assert from "node:assert/strict";
import test from "node:test";

import {
  ToolGatewayError,
  ToolRegistry,
  executeToolIntent,
  type ToolDefinition,
} from "../../../lib/server/tools/index.ts";

const definition: ToolDefinition<{ readonly cityId: string }, { readonly summary: string }> = {
  id: "evidence.city-summary",
  version: "v1",
  description: "Return one normalized city evidence summary.",
  riskClass: "R1_read_only",
  allowedTaskProfiles: ["information_lookup"],
  allowedDataClasses: ["public_evidence"],
  requiresApproval: false,
  idempotency: "required",
  timeoutMs: 1_000,
  retryPolicy: "never",
  maxModelOutputTokens: 80,
  featureFlag: "tool-evidence-city-summary",
  validateInput: (input): input is { readonly cityId: string } => typeof input === "object" && input !== null && typeof (input as { cityId?: unknown }).cityId === "string",
  validateOutput: (output): output is { readonly summary: string } => typeof output === "object" && output !== null && typeof (output as { summary?: unknown }).summary === "string",
};

test("does not execute a model ToolCallIntent until the registry and policy gateway permit it", async () => {
  const registry = new ToolRegistry([definition]);
  let calls = 0;

  const receipt = await executeToolIntent({
    registry,
    intent: { source: "model", callId: "call-1", toolId: definition.id, input: { cityId: "shanghai" } },
    actor: { id: "actor-a", taskProfile: "information_lookup", dataClasses: ["public_evidence"], approvedDigests: [] },
    execute: async () => { calls += 1; return { summary: "Shanghai evidence." }; },
    now: () => "2026-08-28T00:00:00.000Z",
  });

  assert.equal(calls, 1);
  assert.equal(receipt.toolId, definition.id);
  assert.equal(receipt.output.summary, "Shanghai evidence.");
  assert.match(receipt.inputDigest, /^[a-f0-9]{64}$/);
  assert.equal("actorId" in receipt, false);
});

test("rejects unknown, out-of-profile, and invalid intents before a fake executor can run", async () => {
  const registry = new ToolRegistry([definition]);
  let calls = 0;
  const base = { registry, actor: { id: "actor-a", taskProfile: "trip_planning" as const, dataClasses: ["public_evidence"] as const, approvedDigests: [] as const }, execute: async () => { calls += 1; return { summary: "unexpected" }; }, now: () => "2026-08-28T00:00:00.000Z" };

  await assert.rejects(() => executeToolIntent({ ...base, intent: { source: "model", callId: "call-2", toolId: "unknown.tool", input: {} } }), ToolGatewayError);
  await assert.rejects(() => executeToolIntent({ ...base, intent: { source: "model", callId: "call-3", toolId: definition.id, input: { cityId: "shanghai" } } }), ToolGatewayError);
  await assert.rejects(() => executeToolIntent({ ...base, intent: { source: "model", callId: "call-4", toolId: definition.id, input: { cityId: 7 } } }), ToolGatewayError);
  assert.equal(calls, 0);
});

test("requires an exact approval digest for external side effects and never grants Trip write authority", async () => {
  const sideEffect = { ...definition, id: "external.ride-handoff", riskClass: "X_external_side_effect" as const, requiresApproval: true };
  const registry = new ToolRegistry([sideEffect]);
  const intent = { source: "ui" as const, callId: "call-5", toolId: sideEffect.id, input: { cityId: "shanghai" } };
  const actor = { id: "actor-a", taskProfile: "information_lookup" as const, dataClasses: ["public_evidence"] as const, approvedDigests: [] as const };

  await assert.rejects(() => executeToolIntent({ registry, intent, actor, execute: async () => ({ summary: "unexpected" }), now: () => "2026-08-28T00:00:00.000Z" }), ToolGatewayError);
  assert.throws(() => registry.register({ ...definition, id: "trip.direct-write", riskClass: "P_proposal_producing" }), /Trip writes/);
});

test("rejects a replayed idempotency call before it can execute twice", async () => {
  const registry = new ToolRegistry([definition]);
  let calls = 0;
  const request = { registry, intent: { source: "model" as const, callId: "call-replay", toolId: definition.id, input: { cityId: "shanghai" } }, actor: { id: "actor-a", taskProfile: "information_lookup" as const, dataClasses: ["public_evidence"] as const, approvedDigests: [] as const }, execute: async () => { calls += 1; return { summary: "Shanghai evidence." }; }, now: () => "2026-08-28T00:00:00.000Z" };
  await executeToolIntent(request);
  await assert.rejects(() => executeToolIntent(request), ToolGatewayError);
  assert.equal(calls, 1);
});
