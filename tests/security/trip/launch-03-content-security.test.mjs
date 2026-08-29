import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("LAUNCH-03 keeps full Trip content owner-scoped and confirmation-only", () => {
  const migration = readFileSync("supabase/migrations/20260830100000_launch_03_trip_content_snapshots.sql", "utf8");
  assert.match(migration, /create table public\.trip_days/);
  assert.match(migration, /create table public\.trip_items/);
  assert.match(migration, /alter table public\.trip_days enable row level security/);
  assert.match(migration, /alter table public\.trip_items enable row level security/);
  assert.match(migration, /revoke all on public\.trip_days from anon, authenticated/);
  assert.match(migration, /revoke all on public\.trip_items from anon, authenticated/);
  assert.match(migration, /security definer set search_path = public/);
  assert.match(migration, /if \(select auth\.uid\(\)\) is null then raise exception 'FORBIDDEN'/);
  assert.match(migration, /rollback_snapshot_version is null/);
  assert.match(migration, /create or replace function public\.capture_initial_trip_version/);
  assert.match(migration, /jsonb_build_object\('title', new\.title, 'days', '\[\]'::jsonb\)/);
  assert.match(migration, /IDEMPOTENCY_KEY_REUSE/);
  assert.match(migration, /version_conflict/);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete) on public\.(?:trip_days|trip_items) to authenticated/i);
  assert.doesNotMatch(migration, /SUPABASE_SECRET|SUPABASE_SERVICE/i);
});
