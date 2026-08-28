import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateRealtimeFixture,
  inspectFixtureCredentialExpiry,
  requestRealtimeSession,
} from "../../../lib/server/media-translation/realtime/protocol.ts";

test("AI-32 REALTIME-00 normalizes tentative and confirmed events as non-terminal", () => {
  const result = evaluateRealtimeFixture({ fixtureId: "five-locale-finished" });
  assert.equal(result.kind, "realtime_fixture");
  if (result.kind !== "realtime_fixture") throw new Error("expected realtime fixture");

  assert.deepEqual(result.events.map((event) => [event.sequence, event.state, event.terminal]), [
    [1, "opened", false],
    [2, "tentative", false],
    [3, "confirmed", false],
    [4, "finished", true],
  ]);
  assert.equal(result.events.filter((event) => event.terminal).length, 1);
  assert.deepEqual(result.coverage.map((entry) => [entry.sourceLocale, entry.entity, entry.number, entry.latency, entry.cost]), [
    ["zh", "fixture_exact", "fixture_exact", "not_measured", "not_measured"],
    ["en", "fixture_exact", "fixture_exact", "not_measured", "not_measured"],
    ["es", "fixture_exact", "fixture_exact", "not_measured", "not_measured"],
    ["ru", "fixture_exact", "fixture_exact", "not_measured", "not_measured"],
    ["ar", "fixture_exact", "fixture_exact", "not_measured", "not_measured"],
  ]);
  assert.deepEqual(result.authority, {
    browserCredential: "never_issued",
    issuance: "server_authorized_only",
    reconnect: "new_server_authorization_required",
    resume: "not_supported",
  });
});

test("AI-32 REALTIME-00 records cancellation as the only disconnect terminal", () => {
  const result = evaluateRealtimeFixture({ fixtureId: "disconnect-cancelled" });
  assert.equal(result.kind, "realtime_fixture");
  if (result.kind !== "realtime_fixture") throw new Error("expected realtime fixture");
  assert.deepEqual(result.events.map((event) => event.state), ["opened", "tentative", "cancelled"]);
  assert.deepEqual(result.events.filter((event) => event.terminal).map((event) => event.state), ["cancelled"]);
  assert.equal(evaluateRealtimeFixture({ fixtureId: "five-locale-finished", transcript: "must-not-be-accepted" }).kind, "realtime_unavailable");
  assert.equal(evaluateRealtimeFixture({ fixtureId: "unknown" }).kind, "realtime_unavailable");
});

test("AI-32 REALTIME-00 rejects real session creation and expired fixture credentials without exposing a secret", () => {
  assert.deepEqual(requestRealtimeSession({ credential: "long-lived-secret", sdp: "browser-offer" }), {
    kind: "realtime_unavailable",
    reason: "server_authorization_unavailable",
  });
  assert.deepEqual(inspectFixtureCredentialExpiry({ fixtureId: "expired-credential" }), {
    kind: "credential_expired",
    authority: "server_authorized_only",
    reconnect: "new_server_authorization_required",
  });
  assert.equal(inspectFixtureCredentialExpiry({ fixtureId: "expired-credential", credential: "must-not-be-accepted" }).kind, "realtime_unavailable");
});
