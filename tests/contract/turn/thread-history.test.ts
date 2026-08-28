import assert from "node:assert/strict";
import test from "node:test";
import {
  InMemoryThreadStore,
  ThreadAccessError,
  TurnAlreadyTerminalError,
} from "../../../lib/server/turn/thread-store.ts";

const owner = "11111111-1111-4111-8111-111111111111";
const otherOwner = "22222222-2222-4222-8222-222222222222";

test("V4-08 reuses one durable turn for a matching thread idempotency key", () => {
  const store = new InMemoryThreadStore();
  const thread = store.createThread({ id: "thread-1", ownerId: owner });
  const first = store.startTurn({ id: "turn-1", threadId: thread.id, ownerId: owner, idempotencyKey: "same", digest: "digest-a" });
  const replay = store.startTurn({ id: "turn-2", threadId: thread.id, ownerId: owner, idempotencyKey: "same", digest: "digest-a" });

  assert.deepEqual(first, { turnId: "turn-1", reused: false });
  assert.deepEqual(replay, { turnId: "turn-1", reused: true });
  assert.equal(store.history({ threadId: thread.id, ownerId: owner }).length, 1);
});

test("V4-08 replays recorded events without starting a second turn and enforces owner scope", () => {
  const store = new InMemoryThreadStore();
  store.createThread({ id: "thread-1", ownerId: owner, tripId: "trip-1" });
  store.startTurn({ id: "turn-1", threadId: "thread-1", ownerId: owner, idempotencyKey: "key", digest: "digest" });
  store.append({ ownerId: owner, turnId: "turn-1", eventId: "planning", type: "phase", state: "planning" });
  store.append({ ownerId: owner, turnId: "turn-1", eventId: "answer", type: "answer", state: "validating" });

  assert.deepEqual(store.replay({ ownerId: owner, turnId: "turn-1", afterSequence: 1 }).map((event) => event.eventId), ["planning", "answer"]);
  assert.throws(() => store.replay({ ownerId: otherOwner, turnId: "turn-1" }), ThreadAccessError);
  assert.equal(store.history({ threadId: "thread-1", ownerId: owner })[0]?.tripId, "trip-1");
});

test("V4-08 cancellation appends the only terminal event and closes the turn", () => {
  const store = new InMemoryThreadStore();
  store.createThread({ id: "thread-1", ownerId: owner });
  store.startTurn({ id: "turn-1", threadId: "thread-1", ownerId: owner, idempotencyKey: "key", digest: "digest" });

  assert.equal(store.cancel({ ownerId: owner, turnId: "turn-1" }).state, "cancelled");
  assert.equal(store.cancel({ ownerId: owner, turnId: "turn-1" }).state, "cancelled");
  assert.throws(() => store.append({ ownerId: owner, turnId: "turn-1", eventId: "late", type: "phase", state: "generating" }), TurnAlreadyTerminalError);
});
