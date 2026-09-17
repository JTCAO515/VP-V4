import assert from "node:assert/strict";
import test from "node:test";
import { tripCapabilityState, withTripCapabilityState } from "../../../lib/server/trip/capability-state.ts";

test("VPJ-05 reports capability boundaries without inferring a traveller order", () => {
  assert.deepEqual(tripCapabilityState, {
    hardLocks: "not_enabled",
    externalOrderStatus: "not_connected",
  });
  assert.notEqual(tripCapabilityState.externalOrderStatus, "no_order");
});

test("Web and native routes add the same capability state without changing the Trip snapshot", () => {
  const trip = { version: 2, trip: { id: "trip" }, content: { days: [] } };
  assert.deepEqual(withTripCapabilityState(trip), {
    ...trip,
    hardLocks: "not_enabled",
    externalOrderStatus: "not_connected",
  });
});
