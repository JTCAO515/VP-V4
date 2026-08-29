import assert from "node:assert/strict";
import test from "node:test";
import { describeProposalDiff } from "../../../lib/server/trip/proposal/diff.ts";

test("LAUNCH-11 derives immutable day and item changes from a validated TripPatch", () => {
  const result = describeProposalDiff(
    { version: 2, title: "Beijing", days: [{ id: "d1", date: "2026-10-01", items: [{ id: "i1", dayId: "d1", title: "Palace" }] }] },
    { expectedVersion: 2, operations: [{ kind: "upsert_day", dayId: "d2", date: "2026-10-02", timeZone: "Asia/Shanghai" }, { kind: "upsert_item", itemId: "i2", dayId: "d2", title: "Temple", startsAt: "2026-10-02T09:00:00+08:00" }, { kind: "delete_item", itemId: "i1", dayId: "d1" }] },
  );

  assert.deepEqual(result.dayDiffs, [
    { kind: "added", dayId: "d2", date: "2026-10-02", items: [{ kind: "added", itemId: "i2", title: "Temple" }] },
    { kind: "changed", dayId: "d1", date: "2026-10-01", items: [{ kind: "removed", itemId: "i1", title: "Palace" }] },
  ]);
  assert.equal(Object.isFrozen(result.dayDiffs), true);
});
