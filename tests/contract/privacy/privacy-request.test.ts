import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePrivacyRequest,
  PRIVACY_DATA_SCOPES,
} from "../../../lib/server/privacy/contract.ts";

const requestId = "1b47b7c5-4e8c-41fd-8e9a-4d850e01f66e";

test("V4-17 freezes an all-data privacy export request into a closed receipt shape", () => {
  assert.deepEqual(
    normalizePrivacyRequest({
      requestId,
      action: "export",
      scopes: [...PRIVACY_DATA_SCOPES],
    }),
    {
      requestId,
      action: "export",
      scopes: ["profile", "memory", "trip", "turn", "user_artifact"],
      status: "requested",
      execution: "not_started",
    },
  );
});

test("V4-17 rejects partial, reordered, or unknown privacy scopes", () => {
  for (const scopes of [
    ["profile"],
    ["memory", "profile", "trip", "turn", "user_artifact"],
    ["profile", "memory", "trip", "turn", "provider_payload"],
  ]) {
    assert.equal(
      normalizePrivacyRequest({ requestId, action: "delete", scopes }),
      null,
    );
  }
});

test("V4-17 fails closed for malformed privacy request input", () => {
  for (const input of [
    null,
    {},
    { requestId, action: "erase", scopes: PRIVACY_DATA_SCOPES },
    { requestId: "not-a-uuid", action: "export", scopes: PRIVACY_DATA_SCOPES },
    { requestId, action: "export", scopes: PRIVACY_DATA_SCOPES, extra: true },
  ]) {
    assert.equal(normalizePrivacyRequest(input), null);
  }
});
