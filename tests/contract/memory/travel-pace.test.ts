import assert from "node:assert/strict";
import test from "node:test";
import { isTaskTravelPaceInput, isTravelPaceCommand, TRAVEL_PACE_NOTICE } from "../../../lib/server/memory/travel-pace.ts";
const id = "7f34d74e-6c5b-4eea-8ca3-c240a49a326a";
const save = { action: "save", operationId: id, expectedRevision: 0, travelPace: "relaxed", noticeVersion: TRAVEL_PACE_NOTICE };
test("explicit save requires the versioned purpose and exact bounded input; defaults/inference cannot grant consent", () => {
  assert.ok(isTravelPaceCommand(save));
  for (const change of [{ noticeVersion: null }, { noticeVersion: "model" }, { ownerId: id }, { inferred: true },
    { expectedRevision: -1 }, { expectedRevision: 1.1 }, { expectedRevision: Number.MAX_SAFE_INTEGER },
    { operationId: "" }, { travelPace: "sensitive-profile" }, { action: "resume" }]) {
    assert.equal(isTravelPaceCommand({ ...save, ...change }), false);
  }
  for (const action of ["pause", "revoke", "undo"]) {
    assert.ok(isTravelPaceCommand({ action, operationId: id, expectedRevision: 2 }));
    assert.equal(isTravelPaceCommand({ ...save, action }), false);
  }
});
test("task read requires an explicit current-input/skip choice, permits revision revalidation, never accepts actor claims", () => {
  const input = { tripId: id, currentPace: null, useSaved: true };
  assert.ok(isTaskTravelPaceInput(input));
  assert.ok(isTaskTravelPaceInput({ ...input, useSaved: false, currentPace: "packed", expectedSourceRevision: 1 }));
  for (const value of [null, [], { tripId: id, useSaved: true }, { ...input, ownerId: id },
    { ...input, currentPace: "default" }, { ...input, useSaved: "true" }, { ...input, expectedSourceRevision: null },
    { ...input, expectedSourceRevision: -1 }, { ...input, tripId: "../other" }]) assert.equal(isTaskTravelPaceInput(value), false);
});
