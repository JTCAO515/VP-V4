import assert from "node:assert/strict";
import test from "node:test";

import { resolveExternalEvidence } from "../../../lib/server/external-evidence/resolver.ts";

test("RL-06 rejects provider, URL, raw payload and persistent-output keys before resolution", () => {
  const input = {
    now: "2026-08-28T00:00:00.000Z",
    need: { kind: "rail", serviceId: "rail-001", purpose: "trip_recheck", provider: "forbidden" },
    observation: {
      kind: "rail",
      observedAt: "2026-08-27T23:55:00.000Z",
      expiresAt: "2026-08-28T00:30:00.000Z",
      receipt: { policyId: "policy-rail-v1", allowed: true },
      url: "https://forbidden.example",
    },
  };
  assert.throws(() => resolveExternalEvidence(input), TypeError);
});

test("rejects timezone-qualified but impossible calendar timestamps", () => {
  assert.throws(
    () => resolveExternalEvidence({
      now: "2026-02-30T00:00:00Z",
      need: { kind: "weather", locationId: "beijing", purpose: "trip_recheck" },
      observation: { kind: "weather", observedAt: "2026-02-28T00:00:00Z", expiresAt: "2026-03-01T00:00:00Z", receipt: { policyId: "policy-weather-v1", allowed: true } },
    }),
    TypeError,
  );
});

test("rejects future observations and observations after their expiry", () => {
  const base = {
    now: "2026-08-28T00:00:00Z",
    need: { kind: "weather", locationId: "beijing", purpose: "trip_recheck" },
    observation: { kind: "weather", observedAt: "2026-08-29T00:00:00Z", expiresAt: "2026-08-30T00:00:00Z", receipt: { policyId: "policy-weather-v1", allowed: true } },
  } as const;
  assert.throws(() => resolveExternalEvidence(base), TypeError);
  assert.throws(() => resolveExternalEvidence({ ...base, observation: { ...base.observation, observedAt: "2026-08-28T00:00:00Z", expiresAt: "2026-08-27T23:00:00Z" } }), TypeError);
});
