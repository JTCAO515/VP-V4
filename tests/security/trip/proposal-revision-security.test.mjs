import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("AI-13b revision RPC remains owner-scoped and never introduces a service credential", () => {
  const migration = readFileSync("supabase/migrations/20260827030717_ai13b_proposal_revision_lineage.sql", "utf8");
  const route = readFileSync("app/api/trips/[tripId]/proposal/revision/route.ts", "utf8");
  assert.match(migration, /security invoker/);
  assert.doesNotMatch(migration, /security definer/i);
  assert.match(migration, /owner_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /grant execute on function public\.revise_trip_proposal\(uuid, text\) to authenticated/);
  assert.doesNotMatch(`${migration}\n${route}`, /SERVICE_ROLE|service_role|SUPABASE_SECRET|SUPABASE_SERVICE/i);
  assert.match(route, /isSameOriginMutation\(request\)/);
});
