import assert from "node:assert/strict";
import test from "node:test";
import { failureResponse } from "../../../lib/server/identity/failure-response.ts";
import { hasSameOrigin, isConfirmInput, isRollbackInput, isUuid } from "../../../lib/server/identity/request-guards.ts";

const tripId = "5d2a3a26-3b72-4fa7-b121-2a445e1ac9ab";

test("AI-51 accepts only bounded confirm inputs and UUID resource identifiers", () => {
  assert.equal(isUuid(tripId), true);
  assert.equal(isUuid("not-a-uuid"), false);
  assert.equal(isConfirmInput({ proposalId: tripId, idempotencyKey: "key", digest: "digest" }), true);
  assert.equal(isConfirmInput({ proposalId: tripId, idempotencyKey: "", digest: "digest" }), false);
  assert.equal(isConfirmInput({ proposalId: tripId, idempotencyKey: "key", digest: "x".repeat(161) }), false);
});

test("AI-51 rejects cross-origin mutations and maps only frozen failures", () => {
  const requestUrl = new URL("https://go2china.space/api/trips/x/confirm");
  assert.equal(hasSameOrigin("https://go2china.space", requestUrl), true);
  assert.equal(hasSameOrigin("https://attacker.example", requestUrl), false);
  assert.deepEqual(failureResponse("UNAUTHENTICATED"), { error: { code: "UNAUTHENTICATED" }, status: 401 });
});

test("V4-10 accepts only an exact non-negative rollback version", () => {
  assert.equal(isRollbackInput({ targetVersion: 0 }), true);
  assert.equal(isRollbackInput({ targetVersion: 1.5 }), false);
  assert.equal(isRollbackInput({ targetVersion: -1 }), false);
  assert.equal(isRollbackInput({ targetVersion: 1, extra: true }), false);
});
