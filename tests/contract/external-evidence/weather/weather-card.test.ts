import assert from "node:assert/strict";
import test from "node:test";

import { projectWeatherCard } from "../../../../lib/server/external-evidence/weather/projector.ts";

const now = "2026-08-28T08:00:00.000Z";
const input = {
  now,
  weatherDataEnabled: true,
  need: { kind: "weather", locationId: "beijing", purpose: "trip_recheck" },
  observation: {
    kind: "weather",
    observedAt: "2026-08-28T07:45:00.000Z",
    expiresAt: "2026-08-28T08:15:00.000Z",
    receipt: { policyId: "policy-weather-v1", allowed: true },
    report: {
      condition: "rain",
      airQuality: "moderate",
      alert: { severity: "yellow", category: "rainstorm", issuedAt: "2026-08-28T07:40:00.000Z" },
    },
  },
} as const;

test("AI-36 projects only typed fresh weather, AQ, and alert values with its receipt attribution", () => {
  assert.deepEqual(projectWeatherCard(input), {
    kind: "weather_card",
    freshness: "fresh",
    source: "policy-weather-v1",
    observedAt: "2026-08-28T07:45:00.000Z",
    expiresAt: "2026-08-28T08:15:00.000Z",
    condition: "rain",
    airQuality: "moderate",
    alert: { severity: "yellow", category: "rainstorm", issuedAt: "2026-08-28T07:40:00.000Z" },
    recheck: false,
  });
});

test("AI-36 fails closed for disabled, denied, expired, or high-risk free-form weather input", () => {
  for (const value of [
    { ...input, weatherDataEnabled: false },
    { ...input, observation: { ...input.observation, receipt: { ...input.observation.receipt, allowed: false } } },
    { ...input, observation: { ...input.observation, expiresAt: "2026-08-28T07:59:00.000Z" } },
    { ...input, observation: { ...input.observation, report: { ...input.observation.report, alert: { ...input.observation.report.alert, category: "invented" } } } },
  ] as const) {
    const output = projectWeatherCard(value);
    assert.equal(output.kind, "weather_unavailable");
    assert.equal(output.recheck, true);
  }
});

test("RL-06 2/2 rejects provider and raw-payload keys before a weather result exists", () => {
  for (const observation of [
    { ...input.observation, provider: "untrusted" },
    { ...input.observation, rawPayload: "16°C" },
  ]) {
    assert.deepEqual(projectWeatherCard({ ...input, observation }), {
      kind: "weather_unavailable",
      reason: "WEATHER_INPUT_INVALID",
      recheck: true,
    });
  }
});
