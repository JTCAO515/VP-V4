import assert from "node:assert/strict";
import test from "node:test";
import { preparePrivateMediaUpload } from "../../../lib/server/media/private-media.ts";

const now = "2026-08-29T00:00:00.000Z";
const ownerId = "owner-7";
const objectId = "object-9";
const valid = {
  ownerId,
  objectId,
  storagePath: `private/${ownerId}/${objectId}`,
  byteLength: 4_718_593,
  media: { declaredMime: "image/jpeg", magicMime: "image/jpeg" },
  policy: { receiptId: "receipt-3", ownerId, dataClass: "C2", action: "persist", expiresAt: "2026-08-29T01:00:00.000Z" },
};

test("AI-30 RL-06/RL-07 fail closed before a private media upload intent", () => {
  assert.equal(preparePrivateMediaUpload({ ...valid, now }).kind, "media_unavailable");
  for (const input of [
    { ...valid, now, storagePath: "private/other-owner/object-9" },
    { ...valid, now, media: { declaredMime: "image/jpeg", magicMime: "image/png" } },
    { ...valid, now, policy: { ...valid.policy, ownerId: "other-owner" } },
    { ...valid, now, policy: { ...valid.policy, dataClass: "C3" } },
    { ...valid, now, policy: { ...valid.policy, expiresAt: now } },
    { ...valid, now, policy: { ...valid.policy, expiresAt: "2026-02-30T01:00:00Z" } },
    { ...valid, now, ownerId: "victim", storagePath: "private/victim/object-9", policy: { ...valid.policy, ownerId: "victim" } },
    { ...valid, now, body: "never accepted by a Function" },
    { ...valid, now, byteLength: 4_718_592 },
  ]) assert.equal(preparePrivateMediaUpload(input).kind, "media_unavailable");
  assert.equal(preparePrivateMediaUpload(null).kind, "media_unavailable");
});
