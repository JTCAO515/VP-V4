import assert from "node:assert/strict";
import test from "node:test";
import {
  MODEL_PROFILES,
  createFixtureModelGateway,
  isFixtureProfile,
  validateKnownUnknownOutput,
  type ModelTaskRequest,
} from "../../../lib/server/model-gateway/index.ts";

const strictRequest = (): ModelTaskRequest => ({
  requestId: "fixture-request-1",
  profileId: "qwen_37_strict",
  task: "strict_known_unknown",
  dataClass: "c0_synthetic",
  input: "Return a synthetic status.",
});

test("records DeepSeek candidate lifecycles and only submits the Flash API model id", () => {
  assert.equal(MODEL_PROFILES.deepseek_flash.providerModelId, "deepseek-v4-flash");
  assert.equal(MODEL_PROFILES.deepseek_flash.observedDeployment, "DeepSeek-V4-Flash-0731");
  assert.equal(MODEL_PROFILES.deepseek_flash.thinking, "disabled");
  assert.equal(MODEL_PROFILES.deepseek_pro.lifecycle, "ga");
  assert.equal(MODEL_PROFILES.deepseek_vision.lifecycle, "experimental");
});

test("returns a validated strict known result only for the Qwen fixture", async () => {
  const outcome = await createFixtureModelGateway().invoke(strictRequest(), new AbortController().signal);
  assert.deepEqual(outcome, {
    kind: "validated",
    profileId: "qwen_37_strict",
    output: { kind: "known", value: "fixture-ready" },
    usage: { inputTokens: 3, outputTokens: 2 },
  });
});

test("rejects malformed strict output, forbidden data, and unsupported vision before output", async () => {
  const gateway = createFixtureModelGateway();
  const signal = new AbortController().signal;
  assert.equal(validateKnownUnknownOutput(null), false);
  assert.equal(validateKnownUnknownOutput({ kind: "known", value: "" }), false);
  assert.equal(validateKnownUnknownOutput({ kind: "known", value: "fixture-ready", extra: true }), false);
  assert.equal(validateKnownUnknownOutput({ kind: "unknown" }), false);
  assert.deepEqual(await gateway.invoke({ ...strictRequest(), dataClass: "c2_sensitive" }, signal), {
    kind: "unavailable", code: "DATA_POLICY_BLOCKED", reason: "data_policy_blocked",
  });
  assert.deepEqual(await gateway.invoke({ ...strictRequest(), profileId: "deepseek_vision" }, signal), {
    kind: "unavailable", code: "PROVIDER_UNAVAILABLE", reason: "unsupported_task",
  });
  assert.deepEqual(await gateway.invoke({ ...strictRequest(), profileId: "unregistered_profile" as never }, signal), {
    kind: "unavailable", code: "PROVIDER_UNAVAILABLE", reason: "unsupported_task",
  });
});

test("honors an already-aborted signal before producing fixture output", async () => {
  const controller = new AbortController();
  controller.abort();
  assert.deepEqual(await createFixtureModelGateway().invoke(strictRequest(), controller.signal), {
    kind: "cancelled", code: "CANCELLED",
  });
});

test("fails closed for malformed runtime requests and signals", async () => {
  const gateway = createFixtureModelGateway();
  const signal = new AbortController().signal;
  const expected = { kind: "unavailable", code: "INVALID_INPUT", reason: "invalid_request" };
  assert.deepEqual(await gateway.invoke(null as never, signal), expected);
  assert.deepEqual(await gateway.invoke([] as never, signal), expected);
  assert.deepEqual(await gateway.invoke({ ...strictRequest(), input: "" } as never, signal), expected);
  assert.deepEqual(await gateway.invoke(strictRequest(), undefined as never), expected);
});

test("identifies the registry-only vision profile as non-fixture", () => {
  assert.equal(isFixtureProfile(MODEL_PROFILES.deepseek_flash), true);
  assert.equal(isFixtureProfile(MODEL_PROFILES.deepseek_vision), false);
});
