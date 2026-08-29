import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { pendingProposalRead } from "../../../lib/server/identity/user-data-adapter.ts";

const trip = { id: "trip-1", title: "Before", headVersion: 0, updatedAt: "2026-08-27T00:00:00.000Z" };
const pending = {
  id: "proposal-1", revision: 1, base_trip_version: 0, status: "pending", patch: { title: "After" },
  created_at: "2026-08-27T00:00:00.000Z", expires_at: "2099-01-01T00:00:00.000Z",
};

test("AI-13a projects one pending title diff with explicit missing provenance", () => {
  assert.deepEqual(pendingProposalRead({ trip, proposal: pending }), {
    trip,
    proposal: {
      id: "proposal-1", revision: 1, baseTripVersion: 0, status: "pending",
      createdAt: "2026-08-27T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z",
      titleDiff: { before: "Before", after: "After" }, evidence: "not_recorded", assumptions: "not_recorded",
    },
  });
});

test("AI-13a does not project expired, resolved, or malformed pending rows", () => {
  assert.equal(pendingProposalRead({ trip, proposal: { ...pending, expires_at: "2020-01-01T00:00:00.000Z" } }), null);
  assert.equal(pendingProposalRead({ trip, proposal: { ...pending, status: "applied" } }), null);
  assert.equal(pendingProposalRead({ trip, proposal: { ...pending, patch: { title: "" } } }), null);
});

test("AI-13a exposes only owner-scoped pending Proposal reads and the LAUNCH-11 patch boundary", () => {
  const route = readFileSync("app/api/trips/[tripId]/proposal/route.ts", "utf8");
  assert.match(route, /export async function GET/);
  assert.match(route, /adapter\.getPendingProposal\(tripId\)/);
  assert.match(route, /Cache-Control": "private, no-store"/);
  assert.match(route, /export async function POST/);
  assert.match(route, /isTripProposalInput/);
});

test("LAUNCH-11 returns a structured patch only to the owner-scoped pending Proposal reader", () => {
  const structuredPatch = { expectedVersion: 0, operations: [{ kind: "upsert_day", dayId: "day-1", date: "2026-09-01" }] } as const;
  const result = pendingProposalRead({ trip, proposal: { ...pending, patch: structuredPatch } });
  assert.deepEqual(result?.proposal.patch, structuredPatch);
  assert.equal(result?.proposal.titleDiff.after, "Before");
});
