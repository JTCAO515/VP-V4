import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("V4-17 privacy requests are owner-scoped, receipt-backed, and never erase user data inline", () => {
  const migration = readFileSync(
    "supabase/migrations/20260828210000_v4_17_privacy_lifecycle.sql",
    "utf8",
  );
  const route = readFileSync("app/api/privacy/route.ts", "utf8");
  const adapter = readFileSync(
    "lib/server/identity/user-data-adapter.ts",
    "utf8",
  );

  for (const table of ["privacy_requests", "privacy_receipts"]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} enable row level security`),
    );
    assert.match(migration, new RegExp(`revoke all on public\\.${table} from anon`));
    assert.doesNotMatch(
      migration,
      new RegExp(`grant (insert|update|delete) on public\\.${table} to authenticated`),
    );
  }
  assert.match(migration, /if \(select auth\.uid\(\)\) is null then raise exception 'FORBIDDEN'/);
  assert.match(migration, /for update/);
  assert.match(migration, /on conflict \(id\) do nothing/);
  assert.match(migration, /where id = p_request_id for update/);
  assert.match(migration, /prior\.owner_id <> \(select auth\.uid\(\)\).*raise exception 'FORBIDDEN'/);
  assert.match(migration, /request_privacy_action/);
  assert.doesNotMatch(migration, /delete from public\.(user_profiles|memory_profiles|trips|turns)/);
  assert.match(route, /isSameOriginMutation/);
  assert.match(route, /isPrivacyRequestInput/);
  assert.match(route, /Cache-Control": "private, no-store"/);
  assert.doesNotMatch(route, /service_role|SUPABASE_SERVICE/);
  assert.match(adapter, /rpc\("request_privacy_action"/);
  assert.match(
    adapter,
    /message\.includes\("INVALID_PRIVACY_REQUEST"\)[\s\S]*"INVALID_INPUT"/,
  );
  assert.match(
    adapter,
    /message\.includes\("PRIVACY_REQUEST_ID_REUSE"\)[\s\S]*"IDEMPOTENCY_KEY_REUSE"/,
  );
});
