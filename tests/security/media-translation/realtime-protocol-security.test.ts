import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  evaluateRealtimeFixture,
  inspectFixtureCredentialExpiry,
  requestRealtimeSession,
} from "../../../lib/server/media-translation/realtime/protocol.ts";

test("AI-32 RL-07 does not emit raw media, SDP, or a browser credential", () => {
  const outputs = [
    evaluateRealtimeFixture({ fixtureId: "five-locale-finished" }),
    inspectFixtureCredentialExpiry({ fixtureId: "expired-credential" }),
    requestRealtimeSession({ authorization: "secret", audio: "raw-bytes", sdp: "offer" }),
  ];
  const serialized = JSON.stringify(outputs);
  for (const prohibited of ["secret", "raw-bytes", "offer", "audio", "sdp", "token", "apiKey"]) {
    assert.equal(serialized.includes(prohibited), false, `output must not contain ${prohibited}`);
  }
});

test("AI-32 RL-07 keeps the protocol fixture-only and free of provider transport calls", () => {
  const source = readFileSync(new URL("../../../lib/server/media-translation/realtime/protocol.ts", import.meta.url), "utf8");
  for (const prohibited of ["fetch(", "WebSocket", "process.env", "Authorization", "AudioContext"]) {
    assert.equal(source.includes(prohibited), false, `protocol must not contain ${prohibited}`);
  }
});
