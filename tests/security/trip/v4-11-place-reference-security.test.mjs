import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("V4-11 place references are owner-scoped and expose no map provider or service credential", () => {
  const migration = readFileSync("supabase/migrations/20260828180000_v4_11_trip_place_references.sql", "utf8");
  const route = readFileSync("app/api/trips/[tripId]/places/route.ts", "utf8");
  assert.match(migration, /trip place reference owner selects/);
  assert.match(migration, /\(select auth\.uid\(\)\) = owner_id/);
  assert.match(migration, /canonical_poi_id uuid references public\.canonical_pois\(id\)/);
  assert.match(migration, /revoke all on public\.canonical_pois from anon, authenticated/);
  assert.match(migration, /revoke all on public\.trip_place_references from anon/);
  assert.doesNotMatch(migration, /grant select, insert on public\.trip_place_references to authenticated/);
  assert.doesNotMatch(`${migration}\n${route}`, /MAPBOX|GOOGLE_MAPS|AMAP/i);
  assert.doesNotMatch(route, /SERVICE_ROLE|service_role|SUPABASE_SECRET|SUPABASE_SERVICE/i);
});
