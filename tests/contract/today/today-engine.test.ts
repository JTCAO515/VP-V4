import assert from "node:assert/strict";
import test from "node:test";
import { buildToday } from "../../../lib/server/today/index.ts";

const now = new Date("2026-08-28T08:00:00.000Z");
const trip = { id: "trip-a", title: "Beijing weekend", updatedAt: "2026-08-28T07:30:00.000Z" };
const fact = { id: "fact-a", status: "reviewed" as const, licenceAllowed: true, expiresAt: "2026-08-29T00:00:00.000Z", summary: "Carry your passport for the checked entry.", checkKind: "opening" as const };

test("V4-18 makes one eligible fact the deterministic NextAction and returns nine closed checks", () => {
  const result = buildToday({ now, trip, fact });
  assert.deepEqual(result.nextAction, {
    status: "available",
    tripId: "trip-a",
    factId: "fact-a",
    action: "review_fact",
    why: "Carry your passport for the checked entry.",
    asOf: "2026-08-28T08:00:00.000Z",
  });
  assert.deepEqual(result.checks.map((check) => check.kind), ["budget", "arrival_window", "transfer", "opening", "reservation", "price_evidence", "transfer_evidence", "opening_evidence", "reservation_evidence"]);
  assert.deepEqual(result.checks.find((check) => check.kind === "opening"), {
    kind: "opening",
    status: "evidence_available",
    factId: "fact-a",
    why: "Carry your passport for the checked entry.",
  });
  assert.ok(result.checks.filter((check) => check.kind !== "opening").every((check) => check.status === "unknown"));
});

test("V4-18 fails closed when the one fact is not eligible", () => {
  const result = buildToday({ now, trip, fact: { ...fact, status: "draft" } });
  assert.deepEqual(result.nextAction, { status: "unavailable", reason: "NO_ELIGIBLE_EVIDENCE" });
  assert.ok(result.checks.every((check) => check.status === "unknown"));
});

test("V4-18 fails closed for an unregistered check kind or empty Fact identity", () => {
  for (const invalidFact of [{ ...fact, checkKind: "other" as never }, { ...fact, id: "" }]) {
    assert.equal(buildToday({ now, trip, fact: invalidFact }).nextAction.status, "unavailable");
  }
});

test("V4-18 fails closed when the current Trip identity or timestamp is invalid", () => {
  for (const invalidTrip of [{ ...trip, id: "" }, { ...trip, updatedAt: "not-a-time" }, { ...trip, updatedAt: "2026-08-28T07:30:00" }, { ...trip, updatedAt: "2026-02-30T07:30:00.000Z" }, { ...trip, updatedAt: "2026-08-29T00:00:00.000Z" }]) {
    assert.equal(buildToday({ now, trip: invalidTrip, fact }).nextAction.status, "unavailable");
  }
});

test("V4-18 fails closed for malformed runtime input", () => {
  for (const input of [null as never, { now, trip: null as never, fact }, { now, trip, fact: { ...fact, id: null as never } }]) {
    const result = buildToday(input);
    assert.deepEqual(result.nextAction, { status: "unavailable", reason: "NO_ELIGIBLE_EVIDENCE" });
    assert.ok(result.checks.every((check) => check.status === "unknown"));
  }
});

test("V4-18 rejects timezone-less or calendar-invalid Fact expiry", () => {
  for (const expiresAt of ["2026-08-29T00:00:00", "2026-02-30T00:00:00.000Z"]) {
    assert.equal(buildToday({ now, trip, fact: { ...fact, expiresAt } }).nextAction.status, "unavailable");
  }
});

test("V4-18 rejects forged Fact eligibility fields", () => {
  for (const invalidFact of [{ ...fact, status: "reviewed", licenceAllowed: "yes" as never }, { ...fact, status: "draft" as never, licenceAllowed: true }]) {
    assert.equal(buildToday({ now, trip, fact: invalidFact as never }).nextAction.status, "unavailable");
  }
});
