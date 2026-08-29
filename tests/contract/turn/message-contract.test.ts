import assert from "node:assert/strict";
import test from "node:test";
import {
  ContentRetentionError,
  createContentFreeTelemetryReceipt,
  messageRequestDigest,
  normalizeUserMessageInput,
  normalizeValidatedAssistantOutput,
  transitionContentRetention,
} from "../../../lib/server/turn/message-contract.ts";

const request = {
  schemaVersion: "user-message-v1",
  messageId: "message-1",
  threadId: "thread-1",
  locale: "zh",
  text: "帮我安排三天北京行程",
  idempotencyKey: "request-1",
};

test("LAUNCH-05 accepts only bounded five-locale user messages and emits content-free telemetry", () => {
  const message = normalizeUserMessageInput(request);
  assert.deepEqual(message, request);

  const receipt = createContentFreeTelemetryReceipt(message!);
  assert.equal(receipt.contentClass, "c2_trip_sensitive");
  assert.equal(receipt.persistence, "not_persisted");
  assert.deepEqual(Object.keys(receipt).sort(), ["contentClass", "persistence", "schemaVersion", "telemetry"]);
  assert.equal(JSON.stringify(receipt).includes(request.text), false);
  assert.equal(JSON.stringify(receipt).includes("reasoning"), false);
  assert.equal(messageRequestDigest(message!), messageRequestDigest(message!));
  assert.notEqual(messageRequestDigest(message!), messageRequestDigest({ ...message!, text: "另一条请求" }));

  for (const invalid of [
    { ...request, locale: "fr" },
    { ...request, schemaVersion: "user-message-v0" },
    { ...request, text: " " },
    { ...request, text: "x".repeat(4001) },
    { ...request, extra: true },
  ]) {
    assert.equal(normalizeUserMessageInput(invalid), null);
  }
});

test("LAUNCH-05 validates a closed assistant envelope and rejects raw provider fields", () => {
  assert.deepEqual(
    normalizeValidatedAssistantOutput({
      schemaVersion: "assistant-output-v1",
      turnId: "turn-1",
      message: { kind: "clarification", text: "你计划哪几天出行？" },
      cards: [],
      proposal: null,
    }),
    {
      schemaVersion: "assistant-output-v1",
      turnId: "turn-1",
      message: { kind: "clarification", text: "你计划哪几天出行？" },
      cards: [],
      proposal: null,
    },
  );

  assert.equal(
    normalizeValidatedAssistantOutput({
      schemaVersion: "assistant-output-v1",
      turnId: "turn-1",
      message: { kind: "answer", text: "已为你整理。" },
      cards: [],
      proposal: null,
      rawProviderPayload: { hidden: true },
    }),
    null,
  );
  assert.equal(
    normalizeValidatedAssistantOutput({
      schemaVersion: "assistant-output-v1",
      turnId: "turn-1",
      message: { kind: "answer", text: "已整理。" },
      cards: Array.from({ length: 13 }, (_, index) => ({ cardId: `card-${index}`, kind: "summary", text: "内容" })),
      proposal: null,
    }),
    null,
  );
  assert.equal(
    normalizeValidatedAssistantOutput({
      schemaVersion: "assistant-output-v1",
      turnId: "turn-1",
      message: { kind: "unavailable", text: "暂时不可用。" },
      cards: [{ cardId: "card-1" }],
      proposal: null,
    }),
    null,
  );
});

test("LAUNCH-05 keeps content persistence fail-closed until a retention decision exists", () => {
  assert.deepEqual(
    transitionContentRetention({ state: "decision_required", event: "capture_attempted" }),
    { state: "not_persisted", contentPersistence: false, telemetry: "content_free" },
  );
  assert.deepEqual(
    transitionContentRetention({ state: "not_persisted", event: "delete_requested" }),
    { state: "deleted", contentPersistence: false, telemetry: "content_free" },
  );
  assert.throws(
    () => transitionContentRetention({ state: "deleted", event: "capture_attempted" }),
    ContentRetentionError,
  );
});
