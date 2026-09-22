import assert from "node:assert/strict";
import test from "node:test";
import { recordedH04 } from "../../../../evals/harness/recorded/h04-readonly.ts";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function recording() {
  const receipt = { schemaVersion: "validated-model-usage/1", turnId: id(1), policyId: id(2),
    attempt: { scopeId: id(3), ownerId: id(4), taskId: id(1), attemptId: id(5), provider: "qwen", model: "qwen-test", priceVersion: "frozen-test-v1", reservedMicros: 1000, timeoutMs: 1000 },
    usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12, cachedInputTokens: null, uncachedInputTokens: null, reasoningTokens: null, cost: "unknown" },
    actualMicros: 12, observedAt: "2026-09-13T01:00:00.000Z" };
  return { schemaVersion: "vpj67-recorded-usage-input/1", recordedAt: "2026-09-13T02:00:00.000Z", apiSha: "a".repeat(40), workerSha: "b".repeat(40), configurationDigest: "c".repeat(64), prompt: { version: "test-v1", digest: "d".repeat(64) }, binding: { ownerId: id(4), serviceTaskId: id(6), turnId: id(1), policyId: id(2) }, taskRecord: { id: id(6), ownerId: id(4), policyId: id(2) } as { id: string; ownerId: string; policyId: string } | null, turnLink: { turnId: id(1), taskId: id(6), ownerId: id(4) } as { turnId: string; taskId: string; ownerId: string } | null, budgetScopes: [{ id: id(3), ownerId: id(4), currency: "CNY" }], attempts: [{ provider: "qwen", model: "qwen-test", priceVersion: "frozen-test-v1", reservedMicros: 1000, attemptId: id(5), scopeId: id(3), ledgerTaskId: id(6), status: "settled", actualMicros: 12 as number | null, usageReceipt: receipt as typeof receipt | null }] };
}

function sample(locale = "en") {
  return { schemaVersion: "vpj67-h04-recording/1", mode: "fixture", usage: recording(), elapsedMs: 30,
    policyReply: { kind: "policy", policy: { id: id(2), consentState: "accepted" } },
    historyReply: { kind: "grounded_history", turns: [{ kind: "grounded_turn", schemaVersion: "grounded-turn/1", scopeVersion: 1,
      turnId: id(1), serviceTaskId: id(6), threadId: id(7), parentTurnId: null, relationship: "new_goal", locale,
      input: locale === "zh" ? "明天可以参观画廊吗？" : "Can I visit the gallery tomorrow?", createdAt: "2026-09-13T00:59:00.000Z",
      status: "completed", outcome: "clarification", output: "reviewed-answer-v1",
      result: { type: "reviewed_answer", city: "shanghai", originalOutcome: "clarification", completedAt: "2026-09-13T01:00:00.000Z",
        intent: "clarification", requestScope: "unknown", knowledge: null, projection: "current" } }] },
    before: { ownerId: id(4), complete: true, trips: [] as { id: string; content: Record<string, unknown> }[] },
    after: { ownerId: id(4), complete: true, trips: [] as { id: string; content: Record<string, unknown> }[] },
  };
}
test("H04 consumes existing bilingual grounded projections and usage without claiming live acceptance", () => {
  for (const locale of ["en", "zh"]) {
    const result = recordedH04(sample(locale));
    assert.equal(result.recordingConsistency, "PASS"); assert.equal(result.language, locale);
    assert.equal(result.mode, "fixture"); assert.equal(result.requiredModeVerdict, "NOT_RUN");
    assert.equal(result.clarificationTextSemantics, "NOT_RUN"); assert.equal(result.nativeConsumer, "NOT_RUN");
    assert.equal(result.attempts[0].vendorCost, "unknown");
    assert.equal(result.binding.serviceTaskId, id(6)); assert.equal(result.attempts[0].workerTaskId, id(1));
    assert.ok(!JSON.stringify(result).includes("gallery"));
  }
});
test("blocked is not H04 clarification, even when the existing parser accepts it", () => {
  const input = sample(), turn = input.historyReply.turns[0];
  turn.status = "unavailable"; turn.outcome = "blocked"; turn.result.originalOutcome = "blocked"; turn.result.intent = "unsupported";
  const result = recordedH04(input);
  assert.equal(result.recordingConsistency, "FAIL"); assert.equal(result.checks.clarification, false);
});
test("detects Trip creation and equal-count content mutation; order alone is irrelevant", () => {
  const input = sample(); input.after.trips.push({ id: id(8), content: { title: "private trip" } });
  assert.equal(recordedH04(input).checks.tripCountUnchanged, false);
  input.before.trips = [{ id: id(8), content: { title: "old private trip" } }];
  const changed = recordedH04(input);
  assert.equal(changed.checks.tripCountUnchanged, true); assert.equal(changed.checks.tripContentUnchanged, false);
  assert.ok(!JSON.stringify(changed).includes("private trip"));
  input.after.trips = structuredClone(input.before.trips);
  input.before.trips.push({ id: id(9), content: { version: 1 } });
  input.after.trips.unshift({ id: id(9), content: { version: 1 } });
  assert.equal(recordedH04(input).recordingConsistency, "PASS");
});
test("rejects incomplete or foreign snapshots and detects cross-task recordings and missing usage", () => {
  const input = sample(); input.before.complete = false; assert.equal(recordedH04(input).recordingConsistency, "EVIDENCE_INSUFFICIENT");
  input.before.complete = true; input.before.ownerId = id(9); assert.throws(() => recordedH04(input));
  const swapped = sample(); swapped.historyReply.turns[0].serviceTaskId = id(9);
  assert.equal(recordedH04(swapped).checks.taskLinked, false);
  const missing = sample(); missing.usage.attempts = [];
  assert.equal(recordedH04(missing).checks.usageLinked, false);
});
test("rejects malformed projections, duplicate Trips, unknown envelope fields without raw diagnostics", () => {
  const input = sample(); input.historyReply.turns[0].result.intent = "PRIVATE_SECRET";
  assert.throws(() => recordedH04(input), error => error instanceof Error && error.message === "Invalid H04 recording");
  const duplicate = sample(); duplicate.before.trips = [{ id: id(8), content: {} }, { id: id(8), content: {} }];
  assert.throws(() => recordedH04(duplicate));
  assert.throws(() => recordedH04({ ...sample(), secret: "PRIVATE_SECRET" }));
  const denied = sample(); denied.policyReply.policy.consentState = "revoked"; assert.throws(() => recordedH04(denied));
});
