import assert from "node:assert/strict";
import test from "node:test";
import { decideRecoveryProposal, proposeRecovery } from "../../../lib/server/today/recovery/index.ts";

const now = new Date("2026-08-28T08:30:00.000Z");

test("V4-20 creates a pending delay proposal without changing the Trip", () => {
  const trip = { id: "trip-a", version: 3 };
  const result = proposeRecovery({ now, trip, disruption: { kind: "delay", evidenceId: "observation-a", observedAt: "2026-08-28T08:00:00.000Z", expiresAt: "2026-08-28T09:00:00.000Z" } });
  assert.deepEqual(result, { status: "pending_confirmation", tripId: "trip-a", baseVersion: 3, disruption: "delay", evidenceId: "observation-a", observedAt: "2026-08-28T08:00:00.000Z", expiresAt: "2026-08-28T09:00:00.000Z" });
  assert.deepEqual(trip, { id: "trip-a", version: 3 });
});

test("V4-20 requests a recheck when disruption evidence has expired", () => {
  const result = proposeRecovery({
    now,
    trip: { id: "trip-a", version: 3 },
    disruption: {
      kind: "delay",
      evidenceId: "observation-a",
      observedAt: "2026-08-28T08:00:00.000Z",
      expiresAt: "2026-08-28T08:15:00.000Z",
    },
  });

  assert.deepEqual(result, { status: "recheck_required", reason: "EVIDENCE_STALE" });
});

test("V4-20 records user acceptance without writing the Trip", () => {
  const trip = { id: "trip-a", version: 3 };
  const proposal = proposeRecovery({
    now,
    trip,
    disruption: { kind: "closure", evidenceId: "closure-a", observedAt: "2026-08-28T08:00:00.000Z", expiresAt: "2026-08-28T09:00:00.000Z" },
  });
  assert.equal(proposal.status, "pending_confirmation");
  if (proposal.status !== "pending_confirmation") return;

  assert.deepEqual(decideRecoveryProposal({ now, proposal, decision: "accept", trip }), {
    status: "accepted",
    tripId: "trip-a",
    baseVersion: 3,
    disruption: "closure",
    evidenceId: "closure-a",
  });
  assert.deepEqual(trip, { id: "trip-a", version: 3 });
});

test("V4-20 records user rejection without writing the Trip", () => {
  const trip = { id: "trip-a", version: 3 };
  const proposal = proposeRecovery({
    now,
    trip,
    disruption: { kind: "delay", evidenceId: "observation-a", observedAt: "2026-08-28T08:00:00.000Z", expiresAt: "2026-08-28T09:00:00.000Z" },
  });
  assert.equal(proposal.status, "pending_confirmation");
  if (proposal.status !== "pending_confirmation") return;

  assert.deepEqual(decideRecoveryProposal({ now, proposal, decision: "reject", trip }), {
    status: "rejected",
    tripId: "trip-a",
    evidenceId: "observation-a",
  });
  assert.deepEqual(trip, { id: "trip-a", version: 3 });
});

test("V4-20 prevents acceptance after the Trip version has changed", () => {
  const trip = { id: "trip-a", version: 3 };
  const proposal = proposeRecovery({
    now,
    trip,
    disruption: { kind: "delay", evidenceId: "observation-a", observedAt: "2026-08-28T08:00:00.000Z", expiresAt: "2026-08-28T09:00:00.000Z" },
  });
  assert.equal(proposal.status, "pending_confirmation");
  if (proposal.status !== "pending_confirmation") return;

  assert.deepEqual(decideRecoveryProposal({ now, proposal, decision: "accept", trip: { id: "trip-a", version: 4 } }), {
    status: "conflict",
    reason: "TRIP_VERSION_CHANGED",
  });
  assert.deepEqual(trip, { id: "trip-a", version: 3 });
});

test("V4-20 requests a recheck when evidence expires after a proposal is created", () => {
  const proposal = proposeRecovery({
    now,
    trip: { id: "trip-a", version: 3 },
    disruption: { kind: "delay", evidenceId: "observation-a", observedAt: "2026-08-28T08:00:00.000Z", expiresAt: "2026-08-28T09:00:00.000Z" },
  });
  assert.equal(proposal.status, "pending_confirmation");
  if (proposal.status !== "pending_confirmation") return;

  assert.deepEqual(decideRecoveryProposal({
    now: new Date("2026-08-28T09:01:00.000Z"),
    proposal,
    decision: "accept",
    trip: { id: "trip-a", version: 3 },
  }), { status: "recheck_required", reason: "EVIDENCE_STALE" });
});

test("V4-20 fails closed for an unknown recovery decision", () => {
  const proposal = proposeRecovery({
    now,
    trip: { id: "trip-a", version: 3 },
    disruption: { kind: "closure", evidenceId: "closure-a", observedAt: "2026-08-28T08:00:00.000Z", expiresAt: "2026-08-28T09:00:00.000Z" },
  });
  assert.equal(proposal.status, "pending_confirmation");
  if (proposal.status !== "pending_confirmation") return;

  assert.deepEqual(decideRecoveryProposal({ now, proposal, decision: "automatic" as never, trip: { id: "trip-a", version: 3 } }), {
    status: "unavailable",
    reason: "NO_ELIGIBLE_EVIDENCE",
  });
});

test("V4-20 fails closed for a forged recovery proposal", () => {
  assert.deepEqual(decideRecoveryProposal({
    now,
    proposal: {
      status: "pending_confirmation",
      tripId: "trip-a",
      baseVersion: 3,
      disruption: "other",
      evidenceId: "observation-a",
      observedAt: "2026-08-28T08:00:00.000Z",
      expiresAt: "2026-08-28T09:00:00.000Z",
    } as never,
    decision: "accept",
    trip: { id: "trip-a", version: 3 },
  }), { status: "unavailable", reason: "NO_ELIGIBLE_EVIDENCE" });
});

test("V4-20 fails closed without current delay or closure evidence", () => {
  assert.deepEqual(proposeRecovery({ now, trip: { id: "trip-a", version: 3 }, disruption: null }), { status: "unavailable", reason: "NO_ELIGIBLE_EVIDENCE" });
});

test("V4-20 accepts a closure proposal but rejects malformed Trip or evidence", () => {
  assert.equal(proposeRecovery({ now, trip: { id: "trip-a", version: 3 }, disruption: { kind: "closure", evidenceId: "closure-a", observedAt: "2026-08-28T08:00:00.000Z", expiresAt: "2026-08-28T09:00:00.000Z" } }).status, "pending_confirmation");
  for (const input of [{ now, trip: { id: "", version: 3 }, disruption: { kind: "delay" as const, evidenceId: "a", observedAt: "2026-08-28T08:00:00.000Z", expiresAt: "2026-08-28T09:00:00.000Z" } }, { now, trip: { id: "trip-a", version: -1 }, disruption: { kind: "delay" as const, evidenceId: "a", observedAt: "bad", expiresAt: "2026-08-28T09:00:00.000Z" } }]) assert.equal(proposeRecovery(input).status, "unavailable");
});

test("V4-20 fails closed for unknown or future disruption evidence", () => {
  for (const disruption of [
    { kind: "other" as never, evidenceId: "observation-a", observedAt: "2026-08-28T08:00:00.000Z", expiresAt: "2026-08-28T09:00:00.000Z" },
    { kind: "delay" as const, evidenceId: "observation-a", observedAt: "2026-08-28T08:45:00.000Z", expiresAt: "2026-08-28T09:00:00.000Z" },
  ]) {
    assert.deepEqual(proposeRecovery({ now, trip: { id: "trip-a", version: 3 }, disruption }), { status: "unavailable", reason: "NO_ELIGIBLE_EVIDENCE" });
  }
});

test("V4-20 fails closed instead of throwing for malformed runtime proposal input", () => {
  for (const input of [
    { now: {} as never, trip: { id: "trip-a", version: 3 }, disruption: { kind: "delay" as const, evidenceId: "observation-a", observedAt: "2026-08-28T08:00:00.000Z", expiresAt: "2026-08-28T09:00:00.000Z" } },
    { now, trip: { id: null as never, version: 3 }, disruption: { kind: "delay" as const, evidenceId: "observation-a", observedAt: "2026-08-28T08:00:00.000Z", expiresAt: "2026-08-28T09:00:00.000Z" } },
    { now, trip: { id: "trip-a", version: 3 }, disruption: { kind: "delay" as const, evidenceId: null as never, observedAt: "2026-08-28T08:00:00.000Z", expiresAt: "2026-08-28T09:00:00.000Z" } },
  ]) {
    assert.deepEqual(proposeRecovery(input), { status: "unavailable", reason: "NO_ELIGIBLE_EVIDENCE" });
  }
});

test("V4-20 requests a recheck when disruption evidence expires at evaluation time", () => {
  assert.deepEqual(proposeRecovery({
    now,
    trip: { id: "trip-a", version: 3 },
    disruption: { kind: "closure", evidenceId: "closure-a", observedAt: "2026-08-28T08:00:00.000Z", expiresAt: "2026-08-28T08:30:00.000Z" },
  }), { status: "recheck_required", reason: "EVIDENCE_STALE" });
});

test("V4-20 fails closed instead of throwing for malformed recovery decisions", () => {
  const proposal = proposeRecovery({
    now,
    trip: { id: "trip-a", version: 3 },
    disruption: { kind: "delay", evidenceId: "observation-a", observedAt: "2026-08-28T08:00:00.000Z", expiresAt: "2026-08-28T09:00:00.000Z" },
  });
  assert.equal(proposal.status, "pending_confirmation");
  if (proposal.status !== "pending_confirmation") return;

  for (const input of [
    null as never,
    { now, proposal, decision: "accept" as const, trip: null as never },
    { now, proposal: { ...proposal, observedAt: null as never }, decision: "accept" as const, trip: { id: "trip-a", version: 3 } },
  ]) {
    assert.deepEqual(decideRecoveryProposal(input), { status: "unavailable", reason: "NO_ELIGIBLE_EVIDENCE" });
  }
});
