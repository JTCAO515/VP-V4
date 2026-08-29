import assert from "node:assert/strict";
import test from "node:test";
import { decodeTurnSseReplay, turnEventsFromHistory } from "../../../components/chat/turn-stream-client.ts";
import { initialTurnStreamState, turnStreamReducer } from "../../../components/chat/turn-stream-reducer.ts";
import { encodeTurnSseReplay } from "../../../lib/server/turn/sse-replay.ts";

const turnId = "e96bffb3-7b7f-4f60-a3d5-0a8564221480";

test("LAUNCH-08 SSE replay and client reducer converge under reconnect duplicate delivery", () => {
  const first = decodeTurnSseReplay(encodeTurnSseReplay(turnId, [
    { eventId: "accepted", sequence: 1, type: "accepted", state: "accepted" },
    { eventId: "planning", sequence: 2, type: "phase", state: "planning" },
  ]));
  const second = decodeTurnSseReplay(encodeTurnSseReplay(turnId, [
    { eventId: "planning", sequence: 2, type: "phase", state: "planning" },
    { eventId: "done", sequence: 3, type: "terminal", state: "cancelled" },
  ]));
  const afterFirst = turnStreamReducer(initialTurnStreamState, { type: "events", turnId, events: first.events });
  const final = turnStreamReducer(afterFirst, { type: "events", turnId, events: second.events });
  assert.deepEqual(final.byTurn[turnId]?.events.map((event) => event.sequence), [1, 2, 3]);
  assert.equal(final.byTurn[turnId]?.state, "cancelled");
  assert.equal(final.byTurn[turnId]?.terminal, true);
});

test("LAUNCH-08 client preserves the last canonical cursor for polling degradation", () => {
  const state = turnStreamReducer(initialTurnStreamState, {
    type: "events",
    turnId,
    events: [{ turnId, eventId: "accepted", sequence: 1, schemaVersion: "turn-sse-v1", type: "accepted", state: "accepted" }],
  });
  assert.equal(state.byTurn[turnId]?.cursor, 1);
  assert.equal(state.byTurn[turnId]?.terminal, false);
});

test("LAUNCH-08 initializes terminal history through the same reducer vocabulary", () => {
  const events = turnEventsFromHistory(turnId, [
    { eventId: "accepted", sequence: 1, type: "accepted", state: "accepted", createdAt: "2026-08-30T00:00:00.000Z" },
    { eventId: "cancelled", sequence: 2, type: "terminal", state: "cancelled", createdAt: "2026-08-30T00:00:01.000Z" },
  ]);
  const state = turnStreamReducer(initialTurnStreamState, { type: "events", turnId, events });
  assert.equal(state.byTurn[turnId]?.cursor, 2);
  assert.equal(state.byTurn[turnId]?.terminal, true);
});

test("LAUNCH-08 reducer holds its cursor when a replay has a sequence gap", () => {
  const seeded = turnStreamReducer(initialTurnStreamState, {
    type: "events",
    turnId,
    events: [{ turnId, eventId: "accepted", sequence: 1, schemaVersion: "turn-sse-v1", type: "accepted", state: "accepted" }],
  });
  const result = turnStreamReducer(seeded, {
    type: "events",
    turnId,
    events: [{ turnId, eventId: "gap", sequence: 3, schemaVersion: "turn-sse-v1", type: "phase", state: "generating" }],
  });
  assert.equal(result.byTurn[turnId]?.cursor, 1);
});
