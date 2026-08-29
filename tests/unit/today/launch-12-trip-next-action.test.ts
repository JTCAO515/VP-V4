import assert from "node:assert/strict";
import test from "node:test";
import { selectTripNextAction } from "../../../components/today/trip-next-action.ts";

const trip = { id: "trip-1", title: "Confirmed trip", headVersion: 3, updatedAt: "2026-09-01T00:00:00.000Z" };
const item = { id: "item-1", dayId: "day-1", title: "Arrival", startsAt: "2026-09-02T09:00:00+08:00" };

test("LAUNCH-12 selects the next confirmed item from an explicit clock and Day timezone", () => {
  const result = selectTripNextAction({ now: new Date("2026-09-01T12:00:00.000Z"), trip, days: [{ id: "day-1", date: "2026-09-02", timeZone: "Asia/Shanghai", items: [item] }] });
  assert.deepEqual(result, { state: "available", tripId: "trip-1", tripVersion: 3, dayId: "day-1", itemId: "item-1", itemTitle: "Arrival", date: "2026-09-02", reason: "upcoming" });
});

test("LAUNCH-12 distinguishes before, during, and after a confirmed Trip without external evidence", () => {
  const days = [{ id: "day-1", date: "2026-09-02", timeZone: "Asia/Shanghai", items: [item] }];
  assert.equal(selectTripNextAction({ now: new Date("2026-09-01T01:00:00.000Z"), trip, days }).reason, "upcoming");
  assert.equal(selectTripNextAction({ now: new Date("2026-09-02T01:00:00.000Z"), trip, days }).reason, "today");
  assert.deepEqual(selectTripNextAction({ now: new Date("2026-09-03T01:00:00.000Z"), trip, days }), { state: "unavailable", reason: "trip_complete", tripId: "trip-1", tripVersion: 3 });
});

test("LAUNCH-12 fails closed for empty, timezone-missing, malformed, or cross-trip item data", () => {
  const now = new Date("2026-09-01T01:00:00.000Z");
  assert.deepEqual(selectTripNextAction({ now, trip, days: [] }), { state: "unavailable", reason: "no_items", tripId: "trip-1", tripVersion: 3 });
  for (const days of [
    [{ id: "day-1", date: "2026-09-02", items: [item] }],
    [{ id: "day-1", date: "2026-02-30", timeZone: "Asia/Shanghai", items: [item] }],
    [{ id: "day-1", date: "2026-09-02", timeZone: "Asia/Shanghai", items: [{ ...item, dayId: "other-day" }] }],
  ]) assert.equal(selectTripNextAction({ now, trip, days }).reason, "incomplete_data");
});
