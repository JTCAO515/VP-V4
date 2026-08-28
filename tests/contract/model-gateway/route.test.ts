import assert from "node:assert/strict";
import test from "node:test";
import { FixtureCircuitBreaker, canFallback, resolveFixtureRoute } from "../../../lib/server/model-gateway/route/index.ts";

const ordinaryRequest = () => ({
  task: "ordinary_text",
  dataClass: "c0_synthetic",
  modality: "text",
  schema: "none",
  region: "fixture_only",
  policy: "allowed",
  safety: "clear",
});

const strictRequest = () => ({ ...ordinaryRequest(), task: "strict_known_unknown", schema: "known_unknown" });

test("routes only synthetic ordinary and strict fixture tasks to their frozen baseline profiles", () => {
  assert.deepEqual(resolveFixtureRoute(ordinaryRequest()), { kind: "route", profileId: "deepseek_flash", lane: "baseline" });
  assert.deepEqual(resolveFixtureRoute(strictRequest()), { kind: "route", profileId: "qwen_37_strict", lane: "baseline" });
});

test("fails closed before route selection for policy, safety, data class, region, vision, and malformed input", () => {
  assertUnavailable(resolveFixtureRoute({ ...ordinaryRequest(), policy: "blocked" }), "DATA_POLICY_BLOCKED");
  assertUnavailable(resolveFixtureRoute({ ...ordinaryRequest(), safety: "blocked" }), "SAFETY_BLOCKED");
  assertUnavailable(resolveFixtureRoute({ ...ordinaryRequest(), dataClass: "c2_sensitive" }), "DATA_POLICY_BLOCKED");
  assertUnavailable(resolveFixtureRoute({ ...ordinaryRequest(), region: "unapproved" }), "DATA_POLICY_BLOCKED");
  assertUnavailable(resolveFixtureRoute({ ...ordinaryRequest(), modality: "vision" }), "PROVIDER_UNAVAILABLE");
  assertUnavailable(resolveFixtureRoute(null), "INVALID_INPUT");
});

test("rejects raw-content keys at the route and fallback boundaries", () => {
  for (const key of ["prompt", "input", "output", "reasoning", "media", "messages"]) {
    assertUnavailable(resolveFixtureRoute({ ...ordinaryRequest(), [key]: "never-route" }), "INVALID_INPUT");
    assert.equal(canFallback({ code: "PROVIDER_UNAVAILABLE", emittedOutput: false, [key]: "never-route" }), false);
  }
});

test("never falls back after output or across policy, safety, auth, or cancellation terminals", () => {
  assert.equal(canFallback({ code: "PROVIDER_UNAVAILABLE", emittedOutput: false }), true);
  assert.equal(canFallback({ code: "TIMEOUT_BEFORE_OUTPUT", emittedOutput: false }), true);
  assert.equal(canFallback({ code: "MODEL_OUTPUT_INVALID", emittedOutput: false }), true);
  assert.equal(canFallback({ code: "DATA_POLICY_BLOCKED", emittedOutput: false }), false);
  assert.equal(canFallback({ code: "SAFETY_BLOCKED", emittedOutput: false }), false);
  assert.equal(canFallback({ code: "UNAUTHENTICATED", emittedOutput: false }), false);
  assert.equal(canFallback({ code: "CANCELLED", emittedOutput: false }), false);
  assert.equal(canFallback({ code: "PROVIDER_UNAVAILABLE", emittedOutput: true }), false);
});

test("opens a profile circuit after bounded pre-output provider failures and recovers only after cooldown", () => {
  const circuit = new FixtureCircuitBreaker({ threshold: 2, cooldownMs: 1_000 });
  circuit.record("deepseek_flash", "PROVIDER_UNAVAILABLE", 0);
  assert.equal(circuit.isOpen("deepseek_flash", 1), false);
  circuit.record("deepseek_flash", "TIMEOUT_BEFORE_OUTPUT", 10);
  assert.equal(circuit.isOpen("deepseek_flash", 999), true);
  assert.equal(circuit.isOpen("deepseek_flash", 1_010), false);
});

test("rejects a circuit cooldown that would exceed the safe clock range without opening state", () => {
  const circuit = new FixtureCircuitBreaker({ threshold: 1, cooldownMs: 1_000 });
  assert.throws(() => circuit.record("deepseek_flash", "PROVIDER_UNAVAILABLE", Number.MAX_SAFE_INTEGER - 10), RangeError);
  assert.equal(circuit.isOpen("deepseek_flash", Number.MAX_SAFE_INTEGER - 10), false);
});

function assertUnavailable(
  decision: ReturnType<typeof resolveFixtureRoute>,
  code: "INVALID_INPUT" | "DATA_POLICY_BLOCKED" | "SAFETY_BLOCKED" | "PROVIDER_UNAVAILABLE",
): void {
  assert.equal(decision.kind, "unavailable");
  if (decision.kind === "unavailable") assert.equal(decision.code, code);
}
