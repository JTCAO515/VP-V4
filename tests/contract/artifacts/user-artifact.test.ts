import assert from "node:assert/strict";
import test from "node:test";

import { UserArtifactImportStore } from "../../../lib/server/artifacts/user-artifact.ts";

const input = {
  ownerId: "owner-a",
  importId: "import-001",
  artifactId: "artifact-001",
  kind: "ics",
  redaction: { pnr: true, ticketNumber: true, qrCode: true, passport: true },
  segment: { mode: "rail", serviceId: "g1", departsAt: "2026-09-01T08:00:00.000Z", arrivesAt: "2026-09-01T12:30:00.000Z" },
} as const;

test("AI-37 confirms a fully redacted user segment once and emits a receipt-backed pending Proposal", () => {
  const store = new UserArtifactImportStore();
  const result = store.confirm({ ...input, now: "2026-08-28T08:00:00.000Z", tripId: "trip-001", baseTripVersion: 3 });
  assert.deepEqual(result, {
    kind: "confirmed",
    artifact: { id: "artifact-001", ownerId: "owner-a", version: 1, kind: "ics", segment: input.segment, confirmedAt: "2026-08-28T08:00:00.000Z" },
    proposal: { kind: "pending_user_artifact_proposal", tripId: "trip-001", baseTripVersion: 3, artifactId: "artifact-001", artifactVersion: 1 },
  });
});

test("AI-37 replays an identical import but rejects redaction failures and conflicting repeats", () => {
  const store = new UserArtifactImportStore();
  const confirmed = { ...input, now: "2026-08-28T08:00:00.000Z", tripId: "trip-001", baseTripVersion: 3 } as const;
  assert.equal(store.confirm(confirmed).kind, "confirmed");
  assert.equal(store.confirm(confirmed).kind, "already_confirmed");
  assert.deepEqual(store.confirm({ ...confirmed, artifactId: "artifact-002" }), { kind: "import_conflict" });
  assert.deepEqual(new UserArtifactImportStore().confirm({ ...confirmed, redaction: { ...input.redaction, passport: false } }), { kind: "redaction_required" });
});
