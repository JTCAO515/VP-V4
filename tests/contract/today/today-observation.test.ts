import assert from "node:assert/strict";
import test from "node:test";
import { projectTodayObservation } from "../../../lib/server/today/observations.ts";

const now = new Date("2026-08-28T08:00:00.000Z");
const observation = { kind: "weather" as const, observedAt: "2026-08-28T07:45:00.000Z", expiresAt: "2026-08-28T08:15:00.000Z", summary: "Light rain recorded." };

test("V4-19 preserves observation timestamps and never presents a cached observation as live", () => {
  assert.deepEqual(projectTodayObservation({ now, observation }), {
    kind: "weather", state: "current", summary: "Light rain recorded.", observedAt: observation.observedAt, expiresAt: observation.expiresAt, canvasRecheck: false,
  });
});

test("V4-19 marks expired cache stale and missing/provider-failed observations unavailable with recheck", () => {
  for (const [value, expected] of [[{ ...observation, expiresAt: "2026-08-28T07:59:59.000Z" }, "stale"], [null, "unavailable"], [{ kind: "provider_failure" as const }, "unavailable"]] as const) {
    const result = projectTodayObservation({ now, observation: value });
    assert.equal(result.state, expected);
    assert.equal(result.canvasRecheck, true);
  }
});

test("V4-19 rejects malformed timestamps and unregistered observation kinds", () => {
  for (const invalid of [{ ...observation, kind: "other" as never }, { ...observation, observedAt: "not-a-time" }, { ...observation, summary: null as never }, { ...observation, observedAt: "2026-08-28T08:01:00.000Z" }]) {
    assert.equal(projectTodayObservation({ now, observation: invalid }).state, "unavailable");
  }
  assert.equal(projectTodayObservation({ now: new Date("invalid"), observation }).state, "unavailable");
});

test("V4-19 rejects timezone-less or calendar-invalid timestamps and malformed input", () => {
  for (const invalid of [{ ...observation, observedAt: "2026-08-28T07:45:00" }, { ...observation, expiresAt: "2026-02-30T08:15:00.000Z" }, null as never]) {
    assert.deepEqual(projectTodayObservation({ now, observation: invalid }), { kind: "unavailable", state: "unavailable", canvasRecheck: true });
  }
  assert.deepEqual(projectTodayObservation(null as never), { kind: "unavailable", state: "unavailable", canvasRecheck: true });
});
