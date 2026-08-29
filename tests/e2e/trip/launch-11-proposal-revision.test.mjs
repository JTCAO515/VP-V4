import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("LAUNCH-11 revises a pending Proposal with a validated immutable TripPatch child", () => {
  const route = readFileSync("app/api/trips/[tripId]/proposal/revision/route.ts", "utf8");
  const adapter = readFileSync("lib/server/identity/user-data-adapter.ts", "utf8");
  const migration = readFileSync("supabase/migrations/20260830211000_launch_11_trip_proposal_patch_revision.sql", "utf8");
  assert.match(route, /isTripProposalRevisionInput/);
  assert.match(adapter, /revisePendingProposalPatch/);
  assert.match(migration, /revise_trip_proposal_patch/);
  assert.match(migration, /parent_proposal_id/);
  assert.match(migration, /status = 'superseded'/);
  assert.match(migration, /apply_trip_content_patch/);
});
