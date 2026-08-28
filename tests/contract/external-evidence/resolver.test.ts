import assert from "node:assert/strict";
import test from "node:test";

import { resolveExternalEvidence } from "../../../lib/server/external-evidence/resolver.ts";

const now = "2026-08-28T00:00:00.000Z";

test("returns a typed fresh weather observation only with an allow receipt", () => {
  assert.deepEqual(
    resolveExternalEvidence({
      now,
      need: { kind: "weather", locationId: "beijing", purpose: "trip_recheck" },
      observation: {
        kind: "weather",
        observedAt: "2026-08-27T23:55:00.000Z",
        expiresAt: "2026-08-28T00:30:00.000Z",
        receipt: { policyId: "policy-weather-v1", allowed: true },
      },
    }),
    {
      kind: "available",
      freshness: "fresh",
      observation: { kind: "weather", observedAt: "2026-08-27T23:55:00.000Z", expiresAt: "2026-08-28T00:30:00.000Z", policyId: "policy-weather-v1" },
    },
  );
});

test("fails closed before a denied or expired observation can become a claim", () => {
  const base = {
    now,
    need: { kind: "flight", flightId: "flight-001", purpose: "trip_recheck" },
    observation: {
      kind: "flight",
      observedAt: "2026-08-27T23:00:00.000Z",
      expiresAt: "2026-08-27T23:30:00.000Z",
      receipt: { policyId: "policy-flight-v1", allowed: true },
    },
  } as const;
  assert.deepEqual(resolveExternalEvidence(base), { kind: "unavailable", reason: "STALE_OR_EXPIRED" });
  assert.deepEqual(
    resolveExternalEvidence({ ...base, observation: { ...base.observation, expiresAt: "2026-08-28T00:30:00.000Z", receipt: { policyId: "policy-flight-v1", allowed: false } } }),
    { kind: "unavailable", reason: "DATA_POLICY_BLOCKED" },
  );
});
