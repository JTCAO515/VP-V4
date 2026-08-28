import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("V4-16 Profile persistence is owner-only and remains separate from inferred Memory", () => {
  const migration = readFileSync("supabase/migrations/20260828200000_v4_16_user_profiles.sql", "utf8");
  const route = readFileSync("app/api/profile/route.ts", "utf8");
  const adapter = readFileSync("lib/server/identity/user-data-adapter.ts", "utf8");

  assert.match(migration, /create table public\.user_profiles/);
  assert.match(migration, /alter table public\.user_profiles enable row level security/);
  assert.match(migration, /revoke all on public\.user_profiles from anon/);
  assert.match(migration, /user profile owner selects[\s\S]*\(select auth\.uid\(\)\) = owner_id/);
  assert.match(migration, /if \(select auth\.uid\(\)\) is null then raise exception 'FORBIDDEN'/);
  assert.match(migration, /values \(\(select auth\.uid\(\)\)/);
  assert.doesNotMatch(migration, /grant (insert|update|delete) on public\.user_profiles to authenticated/);
  assert.match(route, /isSameOriginMutation/);
  assert.match(route, /Cache-Control": "private, no-store/);
  assert.doesNotMatch(route, /service_role|SERVICE_ROLE|localStorage|sessionStorage/);
  assert.match(adapter, /from\("user_profiles"\)/);
  assert.match(adapter, /rpc\("save_user_profile"/);
  assert.doesNotMatch(adapter.slice(adapter.indexOf("const getUserProfile"), adapter.indexOf("const listMemoryProfiles")), /memory_profiles|memory_consumer_receipts/);
});
