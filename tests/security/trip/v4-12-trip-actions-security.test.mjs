import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("V4-12 action references are owner-readable only and never expose payment or service credentials", () => {
  const migration = readFileSync("supabase/migrations/20260828190000_v4_12_trip_action_references.sql", "utf8");
  const route = readFileSync("app/api/trips/[tripId]/actions/route.ts", "utf8");
  assert.match(migration, /revoke all on public\.trip_action_references from anon, authenticated/);
  assert.match(migration, /trip action reference owner selects/);
  assert.doesNotMatch(migration, /grant select, insert on public\.trip_action_references to authenticated/);
  assert.doesNotMatch(route, /STRIPE|PAYMENT|SERVICE_ROLE|SUPABASE_SERVICE/i);
  assert.doesNotMatch(migration, /create table public\.(?:orders|payments|inventory)/i);
  assert.doesNotMatch(route, /export async function (?:POST|PUT|PATCH|DELETE)/);
});
