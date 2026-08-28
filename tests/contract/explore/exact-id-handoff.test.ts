import assert from "node:assert/strict";
import test from "node:test";
import { prepareExploreHandoff } from "../../../lib/server/explore/exact-id-handoff.ts";

const tripId = "5df1a9c6-dca7-4e57-a460-0f927b3c828b";
const poiId = "f63155a6-80d1-4a6c-bd7e-9ee0764be975";

test("AI-28 carries only exact UUIDs into Ask and never creates a Trip write", () => {
  assert.deepEqual(prepareExploreHandoff({ tripId, poiId, readiness: "current" }), {
    kind: "ask_ready",
    href: `/visepanda/ask?tripId=${tripId}&poiId=${poiId}`,
    poiId,
    readiness: "current",
  });
  assert.deepEqual(prepareExploreHandoff({ tripId, poiId, readiness: "recheck_required" }), {
    kind: "ask_ready",
    href: `/visepanda/ask?tripId=${tripId}&poiId=${poiId}`,
    poiId,
    readiness: "recheck_required",
  });
  assert.deepEqual(prepareExploreHandoff({ tripId, poiId, readiness: "unavailable" }), { kind: "proposal_unavailable", reason: "NO_ELIGIBLE_EVIDENCE" });
  assert.deepEqual(prepareExploreHandoff({ tripId: "not-a-uuid", poiId, readiness: "current" }), { kind: "invalid_scope" });
  assert.deepEqual(prepareExploreHandoff({ tripId, poiId: "marketing-copy", readiness: "current" }), { kind: "invalid_scope" });
  assert.deepEqual(prepareExploreHandoff({ tripId, poiId, readiness: "stale_unknown" }), { kind: "invalid_scope" });
  assert.deepEqual(prepareExploreHandoff({ tripId: [tripId], poiId, readiness: "current" }), { kind: "invalid_scope" });
  assert.deepEqual(prepareExploreHandoff(null), { kind: "invalid_scope" });
});
