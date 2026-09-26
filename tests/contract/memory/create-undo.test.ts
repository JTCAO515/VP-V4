import assert from "node:assert/strict";
import test from "node:test";
import { isMemoryConsentInput, isMemoryCreateInput, isMemoryCreateUndoInput } from "../../../lib/server/identity/request-guards.ts";
import { createReadbackIsCurrent, parseCreateReceipt, takeCreateToast } from "../../../components/copilot/memory-create-toast.ts";
import { missingMemoryCreateV2, missingMemoryRevision } from "../../../lib/server/memory/compat.ts";

test("explicit Memory Undo accepts only its source receipt, exact create version and operation ID", () => {
  const value = { sourceReceiptId: "2fe829b9-4b6e-4e2e-8f9b-71702e1b0fd0",
    expectedRevision: 1, operationId: "b798b8ce-9878-4dd7-94a5-b041530c6a79" };
  assert.equal(isMemoryCreateUndoInput(value), true);
  for (const change of [
    { expectedRevision: 0 }, { expectedRevision: 2 }, { expectedRevision: "1" },
    { sourceReceiptId: "other" }, { operationId: "other" }, { ownerId: "forged" },
  ]) assert.equal(isMemoryCreateUndoInput({ ...value, ...change }), false);
  assert.equal(isMemoryCreateUndoInput(null), false);
  assert.equal(isMemoryCreateUndoInput([value]), false);
});

test("legacy Memory fallback is limited to the exact missing v2 function or revision column", () => {
  assert.equal(missingMemoryCreateV2({ code: "PGRST202", message: "Could not find the function public.create_explicit_memory_profile_v2" }), true);
  assert.equal(missingMemoryCreateV2({ code: "PGRST202", message: "Could not find unrelated RPC" }), false);
  assert.equal(missingMemoryCreateV2({ code: "42501", message: "create_explicit_memory_profile_v2 permission denied" }), false);
  assert.equal(missingMemoryRevision({ code: "42703", message: "column memory_profiles.revision does not exist" }), true);
  assert.equal(missingMemoryRevision({ code: "42703", message: "column other.revision does not exist" }), false);
  assert.equal(missingMemoryRevision({ code: "42501", message: "memory_profiles revision access denied" }), false);
});

test("Memory create and consent carry a rejection-only expected account without accepting forged shapes", () => {
  const owner = "9a2acdc7-b10e-4be3-aab2-c8749872be01";
  const input = { memoryId: "2fe829b9-4b6e-4e2e-8f9b-71702e1b0fd0",
    receiptId: "b798b8ce-9878-4dd7-94a5-b041530c6a79",
    consentId: "994d7df0-1743-491a-80d3-08cc7ecbcd9d", expectedOwnerId: owner,
    constraintKind: "preference", summary: "Walk slowly" };
  assert.equal(isMemoryCreateInput(input), true);
  assert.equal(isMemoryConsentInput({ action: "create", expectedOwnerId: owner }), true);
  assert.equal(isMemoryCreateInput({ ...input, expectedOwnerId: "not-an-owner" }), false);
  assert.equal(isMemoryConsentInput({ action: "create", expectedOwnerId: "not-an-owner" }), false);
  assert.equal(isMemoryConsentInput({ action: "create", expectedOwnerId: owner, unrelated: true }), false);
});

test("a first acknowledged create replay shows one owner-bound toast; reads and later versions do not", () => {
  const expected = { memoryId: "2fe829b9-4b6e-4e2e-8f9b-71702e1b0fd0",
    receiptId: "b798b8ce-9878-4dd7-94a5-b041530c6a79", ownerId: "owner-a" };
  const replay = parseCreateReceipt({ memoryId: expected.memoryId, sourceReceiptId: expected.receiptId,
    ownerId: expected.ownerId, state: "explicit", reused: true, revision: 1, undoAvailable: true }, expected);
  if (!replay.undoAvailable) throw new Error("expected a v2 create receipt");
  const shown = new Set<string>();
  assert.equal(takeCreateToast(replay, "owner-b", shown), false);
  assert.equal(takeCreateToast(replay, "owner-a", shown), true);
  assert.equal(takeCreateToast(replay, "owner-a", shown), false);
  assert.equal(takeCreateToast({ ...replay, revision: 2 }, "owner-a", new Set()), false);
  const readback = { id: expected.memoryId, sourceReceiptId: expected.receiptId,
    revision: 1, state: "explicit", consentStatus: "granted" };
  assert.equal(createReadbackIsCurrent(replay, readback), true);
  assert.equal(createReadbackIsCurrent(replay, { ...readback, revision: 2 }), false);
  assert.equal(createReadbackIsCurrent(replay, { ...readback, consentStatus: "revoked" }), false);
  assert.equal(createReadbackIsCurrent(replay, { ...readback, state: "deleted" }), false);
  const oldServer = parseCreateReceipt({ memoryId: expected.memoryId, sourceReceiptId: null,
    ownerId: expected.ownerId, state: "explicit", reused: false, revision: null,
    undoAvailable: false }, expected);
  assert.equal(takeCreateToast(oldServer, "owner-a", new Set()), false);
  assert.equal(createReadbackIsCurrent(oldServer, readback), false);
  assert.throws(() => parseCreateReceipt({ ...replay, ownerId: "owner-b" }, expected));
  assert.throws(() => parseCreateReceipt({ ...replay, sourceReceiptId: "other" }, expected));
});
