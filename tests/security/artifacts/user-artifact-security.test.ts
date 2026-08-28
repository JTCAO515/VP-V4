import assert from "node:assert/strict";
import test from "node:test";

import { UserArtifactImportStore } from "../../../lib/server/artifacts/user-artifact.ts";

const safe = { ownerId: "owner-a", importId: "import-001", artifactId: "artifact-001", kind: "ics", redaction: { pnr: true, ticketNumber: true, qrCode: true, passport: true }, segment: { mode: "flight", serviceId: "mu1", departsAt: "2026-09-01T08:00:00.000Z", arrivesAt: "2026-09-01T12:30:00.000Z" }, now: "2026-08-28T08:00:00.000Z", tripId: "trip-001", baseTripVersion: 3 } as const;

test("RL-06/RL-07 3/3 rejects PNR, ticket number, and QR payload keys before confirmation", () => {
  for (const input of [
    { ...safe, pnr: "ABC123" },
    { ...safe, ticketNumber: "1234567890" },
    { ...safe, qrPayload: "raw-image-data" },
  ]) assert.deepEqual(new UserArtifactImportStore().confirm(input), { kind: "import_conflict" });
});

test("rejects calendar-invalid confirmation and segment instants before an artifact exists", () => {
  for (const input of [
    { ...safe, now: "2026-02-30T08:00:00.000Z" },
    { ...safe, segment: { ...safe.segment, departsAt: "2026-02-30T08:00:00.000Z" } },
  ]) assert.deepEqual(new UserArtifactImportStore().confirm(input), { kind: "import_conflict" });
});
