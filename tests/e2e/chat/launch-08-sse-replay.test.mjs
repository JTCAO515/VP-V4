import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("LAUNCH-08 Ask workspace consumes SSE through a reducer and bounded polling fallback", () => {
  const workspace = readFileSync("components/chat/ChatThreadWorkspace.tsx", "utf8");
  const client = readFileSync("components/chat/turn-stream-client.ts", "utf8");
  assert.match(workspace, /turnStreamReducer/);
  assert.match(workspace, /replayTurnSse/);
  assert.match(workspace, /setTimeout/);
  assert.match(client, /Last-Event-ID/);
  assert.match(client, /text\/event-stream/);
  assert.match(client, /decodeTurnSseReplay/);
});
