import { test } from "node:test";
import assert from "node:assert/strict";
import { readStoredSnapshot } from "../../../../lib/server/trip/snapshot/read.ts";
import { describeSnapshotDiff } from "../../../../lib/server/trip/proposal/diff.ts";
test("stored rollback target retains exact sparse manualOrder and historic array order", () => {
  const stored = { version: 2, title: "Earlier", content: { title: "Earlier", days: [{ id: "day", date: "2026-10-05", items: [{ id: "c", dayId: "day", title: "C", manualOrder: 0 }, { id: "b", dayId: "day", title: "B" }, { id: "a", dayId: "day", title: "A", manualOrder: 9 }] }] } };
  const before = { version: 5, title: "Current", days: [{ id: "day", date: "2026-10-05", items: [{ id: "a", dayId: "day", title: "A" }, { id: "b", dayId: "day", title: "B" }, { id: "c", dayId: "day", title: "C" }] }] };
  const originalBytes = JSON.stringify(stored), target = readStoredSnapshot(stored)!;
  const after = { ...target, version: before.version + 1 }, diff = describeSnapshotDiff(before, after);
  assert.deepEqual(diff.next.days, stored.content.days);
  assert.equal(diff.next.days[0].items?.[2].manualOrder, 9);
  assert.deepEqual(diff.next.days[0].items?.map(i => i.id), ["c", "b", "a"]);
  assert.equal(JSON.stringify(stored), originalBytes);
  assert.deepEqual(diff.dayDiffs[0].items.map(i => i.kind), ["reordered", "reordered"]);
});
