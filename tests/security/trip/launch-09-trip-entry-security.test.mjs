import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("LAUNCH-09 keeps Trip list/create owner-scoped and removes client credential paths", () => {
  const route = readFileSync("app/api/trips/route.ts", "utf8");
  const adapter = readFileSync("lib/server/identity/user-data-adapter.ts", "utf8");
  const workspace = readFileSync("components/trips/TripListWorkspace.tsx", "utf8");
  assert.match(route, /isSameOriginMutation\(request\)/);
  assert.match(route, /isTripCreateInput\(input\)/);
  assert.match(adapter, /const actor = await authenticated\(\)/);
  assert.match(adapter, /owner_id: actor\.data/);
  assert.doesNotMatch(route, /SERVICE_ROLE|service_role|SUPABASE_SECRET/i);
  assert.doesNotMatch(workspace, /SUPABASE|\.from\("trips"/i);
});
