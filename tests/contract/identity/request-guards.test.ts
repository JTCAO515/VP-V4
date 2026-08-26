import assert from "node:assert/strict";
import test from "node:test";
import { failureResponse } from "../../../lib/server/identity/failure-response.ts";
import { hasSameOrigin, isConfirmInput, isUuid } from "../../../lib/server/identity/request-guards.ts";

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
