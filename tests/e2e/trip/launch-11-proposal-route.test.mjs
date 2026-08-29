import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("LAUNCH-11 creates manual proposals only through a validated owner-scoped patch boundary", () => {
  const route = readFileSync("app/api/trips/[tripId]/proposal/route.ts", "utf8");
  const adapter = readFileSync("lib/server/identity/user-data-adapter.ts", "utf8");
  const guards = readFileSync("lib/server/identity/request-guards.ts", "utf8");
  const migration = readFileSync("supabase/migrations/20260830210000_launch_11_trip_proposal_patch.sql", "utf8");

  assert.match(route, /export async function POST/);
  assert.match(route, /isTripProposalInput/);
  assert.match(adapter, /createPendingProposal/);
  assert.match(guards, /isTripProposalInput/);
  assert.match(migration, /create_trip_proposal_patch/);
  assert.match(migration, /for update/);
  assert.match(migration, /apply_trip_content_patch/);
  assert.doesNotMatch(route, /fetch\(|prompt/i);
});
