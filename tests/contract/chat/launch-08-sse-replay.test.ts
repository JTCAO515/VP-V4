import assert from "node:assert/strict";
import test from "node:test";
import {
  TurnSseReplayError,
  encodeTurnSseReplay,
  resolveTurnReplayCursor,
} from "../../../lib/server/turn/sse-replay.ts";

const turnId = "e96bffb3-7b7f-4f60-a3d5-0a8564221480";

test("LAUNCH-08 resumes canonical replay from Last-Event-ID or the matching sequence query", () => {
  assert.equal(resolveTurnReplayCursor({ afterSequence: "2", lastEventId: "2" }), 2);
  assert.equal(resolveTurnReplayCursor({ afterSequence: null, lastEventId: "3" }), 3);
  assert.throws(
    () => resolveTurnReplayCursor({ afterSequence: "2", lastEventId: "3" }),
    TurnSseReplayError,
  );
});

test("LAUNCH-08 emits ordered content-free SSE events then a bounded degraded heartbeat", () => {
  const encoded = encodeTurnSseReplay(turnId, [
    { eventId: "accepted", sequence: 1, type: "accepted", state: "accepted" },
    { eventId: "planning", sequence: 2, type: "phase", state: "planning" },
  ]);
  assert.match(encoded, /^id: 1\nevent: turn\ndata: /m);
  assert.match(encoded, /"schemaVersion":"turn-sse-v1"/);
  assert.match(encoded, /"turnId":"e96bffb3-7b7f-4f60-a3d5-0a8564221480"/);
  assert.match(encoded, /event: heartbeat\ndata: \{"afterSequence":2\}/);
  assert.doesNotMatch(encoded, /message|content|provider|createdAt/i);
});

test("LAUNCH-08 terminal replay closes without a heartbeat and rejects invalid canonical history", () => {
  const terminal = encodeTurnSseReplay(turnId, [
    { eventId: "accepted", sequence: 1, type: "accepted", state: "accepted" },
    { eventId: "done", sequence: 2, type: "terminal", state: "cancelled" },
  ]);
  assert.doesNotMatch(terminal, /heartbeat/);
  assert.throws(
    () => encodeTurnSseReplay(turnId, [{ eventId: "leak", sequence: 1, type: "phase", state: "completed" }]),
    TurnSseReplayError,
  );
});

test("LAUNCH-08 rejects a replay that moves a non-terminal phase backwards", () => {
  assert.throws(
    () => encodeTurnSseReplay(turnId, [
      { eventId: "generating", sequence: 4, type: "phase", state: "generating" },
      { eventId: "planning", sequence: 5, type: "phase", state: "planning" },
    ]),
    TurnSseReplayError,
  );
});
