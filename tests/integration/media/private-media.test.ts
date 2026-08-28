import assert from "node:assert/strict";
import test from "node:test";
import { preparePrivateMediaDeletion, prepareProviderFileDeletion } from "../../../lib/server/media/private-media.ts";

const now = "2026-08-29T00:00:00.000Z";
const ownerId = "owner-7";
const objectId = "object-9";
const policy = { receiptId: "receipt-3", ownerId, dataClass: "C2", action: "persist", expiresAt: "2026-08-29T01:00:00.000Z" };

test("AI-30 does not make caller metadata into a deletion capability", () => {
  assert.deepEqual(preparePrivateMediaDeletion({ now, ownerId, objectId, storagePath: `private/${ownerId}/${objectId}`, policy }), { kind: "media_unavailable" });
  assert.equal(preparePrivateMediaDeletion({ now, ownerId: "other", objectId, storagePath: `private/${ownerId}/${objectId}`, policy }).kind, "media_unavailable");
});

test("AI-30 rejects unverified provider file deletion before any adapter call", () => {
  assert.deepEqual(prepareProviderFileDeletion({ provider: "deepseek_files", fileId: "opaque-file-4", expiresAt: "2026-08-29T00:10:00.000Z", now }), { kind: "media_unavailable" });
  assert.equal(prepareProviderFileDeletion({ provider: "deepseek_files", fileId: "opaque-file-4", now }).kind, "media_unavailable");
  assert.equal(prepareProviderFileDeletion({ provider: "deepseek_files", fileId: "opaque-file-4", expiresAt: "2026-02-30T00:10:00Z", now }).kind, "media_unavailable");
});
