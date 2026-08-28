import assert from "node:assert/strict";
import test from "node:test";

import { UserArtifactImportStore } from "../../../../lib/server/artifacts/user-artifact.ts";
import { projectRailGuidance } from "../../../../lib/server/external-evidence/rail/guidance.ts";

test("AI-38 exposes confirmed user rail times only with an official recheck action", () => {
  const store = new UserArtifactImportStore();
  store.confirm({ ownerId: "owner-a", importId: "import-001", artifactId: "artifact-001", kind: "ics", redaction: { pnr: true, ticketNumber: true, qrCode: true, passport: true }, segment: { mode: "rail", serviceId: "g1", departsAt: "2026-09-01T08:00:00.000Z", arrivesAt: "2026-09-01T12:30:00.000Z" }, now: "2026-08-28T08:00:00.000Z", tripId: "trip-001", baseTripVersion: 3 });
  assert.deepEqual(projectRailGuidance({ ownerId: "owner-a", serviceId: "g1", artifactId: "artifact-001" }, store), {
    kind: "rail_guidance", serviceId: "g1", timing: { departsAt: "2026-09-01T08:00:00.000Z", arrivesAt: "2026-09-01T12:30:00.000Z" }, officialRecheck: true,
  });
});

test("AI-38 never invents a schedule when no confirmed artifact exists", () => {
  assert.deepEqual(projectRailGuidance({ ownerId: "owner-a", serviceId: "g1", artifactId: "never-confirmed" }, new UserArtifactImportStore()), { kind: "rail_unavailable", officialRecheck: true });
});
