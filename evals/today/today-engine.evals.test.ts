import assert from "node:assert/strict";
import test from "node:test";
import { buildToday } from "../../lib/server/today/index.ts";

test("V4-18 eval: expired, unlicensed, and draft facts never produce a Today action", () => {
  const base = { id: "fact", status: "reviewed" as const, licenceAllowed: true, expiresAt: "2026-08-29T00:00:00.000Z", summary: "Check entry rules.", checkKind: "opening" as const };
  const input = { now: new Date("2026-08-30T00:00:00.000Z"), trip: { id: "trip", title: "Trip", updatedAt: "2026-08-28T00:00:00.000Z" } };
  for (const fact of [{ ...base }, { ...base, expiresAt: "2026-08-27T00:00:00.000Z" }, { ...base, licenceAllowed: false }, { ...base, status: "draft" as const }]) {
    assert.equal(buildToday({ ...input, fact }).nextAction.status, "unavailable");
  }
});
