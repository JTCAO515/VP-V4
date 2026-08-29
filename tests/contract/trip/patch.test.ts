import assert from "node:assert/strict";
import test from "node:test";
import { applyPatch, assertTripPatch, InvalidTripPatchError } from "../../../lib/server/trip/patch/contract.ts";

const initial = {
  version: 1,
  title: "Trip",
  days: [{ id: "day-beijing", date: "2026-10-01", timeZone: "Asia/Shanghai", items: [] }],
} as const;

test("requires a versioned closed patch operation set", () => {
  assert.doesNotThrow(() => assertTripPatch({ expectedVersion: 0, operations: [{ kind: "set_title", title: "Beijing" }] }));
  assert.throws(() => assertTripPatch({ expectedVersion: -1, operations: [{ kind: "set_title", title: "x" }] }), InvalidTripPatchError);
  assert.throws(() => assertTripPatch({ expectedVersion: 1, operations: [] }), InvalidTripPatchError);
  assert.throws(() => assertTripPatch({ expectedVersion: 1, operations: [{ kind: "upsert_item", itemId: "i", dayId: "d", title: "x", extra: true } as never] }), InvalidTripPatchError);
});

test("applies day and item edits deterministically and keeps legacy title/day snapshots readable", () => {
  const patch = {
    expectedVersion: 1,
    operations: [
      { kind: "upsert_day" as const, dayId: "day-xian", date: "2026-10-02", timeZone: "Asia/Shanghai" },
      { kind: "upsert_item" as const, itemId: "terracotta", dayId: "day-xian", title: "Terracotta Army", startsAt: "2026-10-02T09:00:00+08:00", endsAt: "2026-10-02T12:00:00+08:00" },
    ],
  };
  const applied = applyPatch(initial, patch);
  assert.deepEqual(applied, applyPatch(initial, patch));
  assert.deepEqual(applied.days.map((day) => day.id), ["day-beijing", "day-xian"]);
  assert.equal(applied.days[1]?.items?.[0]?.id, "terracotta");
  assert.deepEqual(applyPatch({ version: 1, title: "Legacy", days: [{ id: "d", date: "2026-10-01" }] }, { expectedVersion: 1, operations: [{ kind: "set_title", title: "Still readable" }] }).days[0]?.items, []);
});

test("fails closed for stale patches, illegal day/item order, duplicate dates, and invalid time windows", () => {
  assert.throws(() => applyPatch(initial, { expectedVersion: 2, operations: [{ kind: "set_title", title: "x" }] }), InvalidTripPatchError);
  assert.throws(() => applyPatch(initial, { expectedVersion: 1, operations: [{ kind: "upsert_item", itemId: "orphan", dayId: "missing", title: "No day" }] }), InvalidTripPatchError);
  assert.throws(() => applyPatch(initial, { expectedVersion: 1, operations: [{ kind: "upsert_day", dayId: "duplicate-date", date: "2026-10-01" }] }), InvalidTripPatchError);
  assert.throws(() => applyPatch(initial, { expectedVersion: 1, operations: [{ kind: "upsert_item", itemId: "bad-window", dayId: "day-beijing", title: "Bad", startsAt: "2026-10-01T12:00:00+08:00", endsAt: "2026-10-01T09:00:00+08:00" }] }), InvalidTripPatchError);
});
