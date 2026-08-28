import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("V4-10 rollback is owner-bound, proposal-confirmed, and cannot re-enable direct Trip updates", () => {
  const migration = readFileSync("supabase/migrations/20260828170000_v4_10_trip_version_snapshots.sql", "utf8");
  const route = readFileSync("app/api/trips/[tripId]/rollback/route.ts", "utf8");
  const adr = readFileSync("docs/adr/ADR-0019-trip-snapshot-rollback-authorization.md", "utf8");
  assert.match(migration, /trip version snapshot owner selects/);
  assert.match(migration, /if \(select auth\.uid\(\)\) is null then raise exception 'FORBIDDEN'/);
  assert.match(migration, /revoke update on public\.trips from authenticated/);
  assert.match(migration, /drop policy "trip owner updates" on public\.trips/);
  assert.match(migration, /grant execute on function public\.create_trip_rollback_proposal\(uuid, integer\) to authenticated/);
  assert.match(route, /isSameOriginMutation\(request\)/);
  assert.match(adr, /only V4-10 `security definer` user-JWT RPC exceptions/);
  assert.match(adr, /auth\.uid\(\)/);
  assert.match(adr, /server\/service-key transaction/);
  assert.doesNotMatch(route, /SERVICE_ROLE|service_role|SUPABASE_SECRET|SUPABASE_SERVICE/i);
});
