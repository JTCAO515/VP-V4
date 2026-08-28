import assert from "node:assert/strict";
import test from "node:test";

import { UserArtifactImportStore } from "../../../../lib/server/artifacts/user-artifact.ts";
import { projectRailGuidance } from "../../../../lib/server/external-evidence/rail/guidance.ts";

test("RL-06 3/3 rejects provider, URL, and crawler input before rail guidance exists", () => {
  const base = { serviceId: "g1", confirmedArtifact: null };
  for (const value of [{ ...base, provider: "12306" }, { ...base, url: "https://example.test" }, { ...base, crawler: true }]) {
    assert.deepEqual(projectRailGuidance(value, new UserArtifactImportStore()), { kind: "rail_unavailable", officialRecheck: true });
  }
});
