import assert from "node:assert/strict";
import test from "node:test";
import {
  assertMemoryProfile,
  projectRetrievableMemory,
  type MemoryProfile,
} from "../../../lib/server/memory/profile.ts";

const base: MemoryProfile = {
  id: "memory-a",
  ownerId: "actor-a",
  sourceReceiptId: "receipt-a",
  consentStatus: "granted",
  state: "confirmed",
  constraintKind: "preference",
  summary: "Avoid late-night arrivals.",
  updatedAt: "2026-08-28T00:00:00.000Z",
};

test("V4-13 excludes paused, rejected, deleted, and revoked-consent memory from retrieval", () => {
  const result = projectRetrievableMemory([
    base,
    { ...base, id: "paused", state: "paused" },
    { ...base, id: "rejected", state: "rejected" },
    { ...base, id: "deleted", state: "deleted", summary: null },
    { ...base, id: "revoked", consentStatus: "revoked" },
    { ...base, id: "inferred", state: "inferred" },
    { ...base, id: "explicit", state: "explicit" },
  ]);

  assert.deepEqual(result.map((memory) => memory.id), ["memory-a", "explicit"]);
});

test("V4-13 rejects inferred hard constraints and projects eligible hard constraints first", () => {
  assert.throws(() => assertMemoryProfile({ ...base, state: "inferred", constraintKind: "hard_constraint" }), /hard constraint/i);
  const result = projectRetrievableMemory([
    base,
    { ...base, id: "hard", constraintKind: "hard_constraint", state: "explicit" },
  ]);

  assert.deepEqual(result.map((memory) => memory.id), ["hard", "memory-a"]);
});

test("V4-13 requires an owner, consent, source receipt, bounded summary, and a valid timestamp", () => {
  for (const memory of [
    { ...base, ownerId: "" },
    { ...base, sourceReceiptId: "" },
    { ...base, summary: "x".repeat(501) },
    { ...base, updatedAt: "not-a-time" },
  ]) assert.throws(() => assertMemoryProfile(memory));
});
