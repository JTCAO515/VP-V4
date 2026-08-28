import assert from "node:assert/strict";
import test from "node:test";

import { UserArtifactImportStore } from "../../../lib/server/artifacts/user-artifact.ts";

test("AI-37 keeps confirmation owner-scoped and never applies its pending Proposal to a Trip", () => {
  const store = new UserArtifactImportStore();
  const result = store.confirm({ ownerId: "owner-a", importId: "import-001", artifactId: "artifact-001", kind: "pdf", redaction: { pnr: true, ticketNumber: true, qrCode: true, passport: true }, segment: { mode: "rail", serviceId: "g1", departsAt: "2026-09-01T08:00:00.000Z", arrivesAt: "2026-09-01T12:30:00.000Z" }, now: "2026-08-28T08:00:00.000Z", tripId: "trip-001", baseTripVersion: 3 });
  assert.equal(result.kind, "confirmed");
  if (result.kind !== "confirmed") return;
  assert.equal(result.artifact.ownerId, "owner-a");
  assert.equal(result.proposal.kind, "pending_user_artifact_proposal");
  assert.equal("snapshot" in result.proposal, false);
});
