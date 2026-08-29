import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { TurnSseReplayError, encodeTurnSseReplay } from "../../../lib/server/turn/sse-replay.ts";

const turnId = "e96bffb3-7b7f-4f60-a3d5-0a8564221480";

test("LAUNCH-08 rejects raw or cross-turn fields before encoding an SSE event", () => {
  assert.throws(
    () => encodeTurnSseReplay(turnId, [{ eventId: "accepted", sequence: 1, type: "accepted", state: "accepted", message: "private" }]),
    TurnSseReplayError,
  );
  assert.throws(
    () => encodeTurnSseReplay("other", [{ eventId: "accepted", sequence: 1, type: "accepted", state: "accepted", turnId }]),
    TurnSseReplayError,
  );
});

test("LAUNCH-08 event transport remains private, no-store, owner-adapter backed and credential-free", () => {
  const route = readFileSync("app/api/chat/turns/[turnId]/events/route.ts", "utf8");
  assert.match(route, /createUserDataAdapter/);
  assert.match(route, /Last-Event-ID/);
  assert.match(route, /TURN_SSE_CONTENT_TYPE/);
  assert.match(route, /Cache-Control/);
  assert.doesNotMatch(route, /SERVICE_ROLE|service_role|SUPABASE_SERVICE|Authorization/i);
});
