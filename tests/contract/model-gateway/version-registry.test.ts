import assert from "node:assert/strict";
import test from "node:test";

import { createPromptBoundary } from "../../../lib/server/model-gateway/prompt/index.ts";
import { recordVersionedAttempt } from "../../../lib/server/model-gateway/registry/index.ts";

const digest = "a".repeat(64);

const versions = () => ({
  prompt: { version: "prompt-v1", digest },
  schema: { version: "schema-v1", digest },
  routePolicy: { version: "route-v1", digest },
  safePhrase: { version: "safe-v1", digest },
});

test("keeps stable prompt metadata separate from untrusted variable descriptors", () => {
  assert.deepEqual(createPromptBoundary({
    versions: versions(),
    tripVersion: "trip-v4",
    evidenceVersion: "receipt-v2",
    messageVersion: "message-v7",
    externalText: "untrusted",
  }), {
    kind: "ready",
    stable: versions(),
    variable: { tripVersion: "trip-v4", evidenceVersion: "receipt-v2", messageVersion: "message-v7", externalText: "untrusted" },
  });
  assert.deepEqual(createPromptBoundary({ ...{
    versions: versions(), tripVersion: "trip-v4", evidenceVersion: "receipt-v2", messageVersion: "message-v7", externalText: "untrusted",
  }, prompt: "raw content must not enter the registry" }), { kind: "invalid" });
});

test("records every versioned attempt and holds promotion when the returned model or observed version drifts", () => {
  assert.deepEqual(recordVersionedAttempt({
    attemptId: "attempt-1",
    requestedModel: "deepseek-v4-flash",
    returnedModel: "deepseek-v4-flash",
    expectedObservedVersion: "DeepSeek-V4-Flash-0731",
    observedVersion: "DeepSeek-V4-Flash-0731",
    versions: versions(),
  }), {
    kind: "recorded",
    promotion: "hold",
    attemptId: "attempt-1",
    versions: versions(),
  });
  assert.deepEqual(recordVersionedAttempt({
    attemptId: "attempt-2",
    requestedModel: "deepseek-v4-flash",
    returnedModel: "deepseek-v4-flash-2027",
    expectedObservedVersion: "DeepSeek-V4-Flash-0731",
    observedVersion: "DeepSeek-V4-Flash-0731",
    versions: versions(),
  }), {
    kind: "drift_detected",
    promotion: "hold",
    attemptId: "attempt-2",
    checks: ["conformance", "eval"],
    versions: versions(),
  });
  assert.deepEqual(recordVersionedAttempt({
    attemptId: "attempt-3",
    requestedModel: "deepseek-v4-flash",
    returnedModel: "deepseek-v4-flash",
    expectedObservedVersion: "DeepSeek-V4-Flash-0731",
    observedVersion: "DeepSeek-V4-Flash-0801",
    versions: versions(),
  }), {
    kind: "drift_detected",
    promotion: "hold",
    attemptId: "attempt-3",
    checks: ["conformance", "eval"],
    versions: versions(),
  });
});

test("rejects raw prompt, reasoning, or unknown attempt fields", () => {
  assert.deepEqual(recordVersionedAttempt({
    attemptId: "attempt-4",
    requestedModel: "deepseek-v4-flash",
    returnedModel: "deepseek-v4-flash",
    expectedObservedVersion: "DeepSeek-V4-Flash-0731",
    observedVersion: "DeepSeek-V4-Flash-0731",
    versions: versions(),
    reasoning: "never persist",
  }), { kind: "invalid" });
});
