import assert from "node:assert/strict";
import test from "node:test";
import {
  messageRequestDigest,
  normalizeUserMessageInput,
} from "../../../lib/server/turn/message-contract.ts";
import { InMemoryThreadStore } from "../../../lib/server/turn/thread-store.ts";

const ownerId = "11111111-1111-4111-8111-111111111111";
const message = normalizeUserMessageInput({
  schemaVersion: "user-message-v1",
  messageId: "message-1",
  threadId: "thread-1",
  locale: "ar",
  text: "أحتاج مسارًا لثلاثة أيام",
  idempotencyKey: "retry-1",
});

test("LAUNCH-05 retries a normalized message as one turn without putting content in turn events", () => {
  assert.ok(message);
  const store = new InMemoryThreadStore();
  store.createThread({ id: message.threadId, ownerId });
  const digest = messageRequestDigest(message);

  assert.deepEqual(
    store.startTurn({ id: "turn-1", threadId: message.threadId, ownerId, idempotencyKey: message.idempotencyKey, digest }),
    { turnId: "turn-1", reused: false },
  );
  assert.deepEqual(
    store.startTurn({ id: "turn-2", threadId: message.threadId, ownerId, idempotencyKey: message.idempotencyKey, digest }),
    { turnId: "turn-1", reused: true },
  );
  assert.equal(JSON.stringify(store.history({ threadId: message.threadId, ownerId })).includes(message.text), false);
});
