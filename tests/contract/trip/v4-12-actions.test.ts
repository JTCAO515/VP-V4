import assert from "node:assert/strict";
import test from "node:test";
import { projectTripActions } from "../../../lib/server/trip/actions/contract.ts";

test("V4-12 preserves Trip provenance and degrades missing external links", () => {
  const result = projectTripActions([
    { id: "artifact-1", kind: "user_ticket", source: "trip", status: "current", label: "Ticket reference", externalLinkUrl: null },
    { id: "reservation-1", kind: "reservation", source: "trip", status: "recheck_required", label: "Reservation required", externalLinkUrl: "https://official.example/reserve" },
  ]);
  assert.deepEqual(result, [
    { id: "artifact-1", kind: "user_ticket", source: "trip", status: "current", label: "Ticket reference", externalLinkUrl: null, outcome: "unavailable" },
    { id: "reservation-1", kind: "reservation", source: "trip", status: "recheck_required", label: "Reservation required", externalLinkUrl: "https://official.example/reserve", outcome: "recheck_required" },
  ]);
});
