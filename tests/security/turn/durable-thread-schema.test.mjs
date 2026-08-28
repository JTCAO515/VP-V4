import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("V4-08 durable chat storage is owner-scoped, append-only, and excludes anon", () => {
  const migration = readFileSync("supabase/migrations/20260828153000_v4_08_durable_chat_threads.sql", "utf8");
  for (const table of ["chat_threads", "chat_turn_events", "chat_turn_idempotency"]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on public\\.${table} from anon`));
    assert.match(migration, new RegExp(`\\(select auth\\.uid\\(\\)\\) = owner_id`));
  }
  assert.match(migration, /create function public\.append_chat_turn_event/);
  assert.match(migration, /terminal turn cannot emit events/);
  assert.match(migration, /IDEMPOTENCY_KEY_REUSE/);
  assert.match(migration, /p_digest <> 'chat-state-control-v1'/);
  assert.match(migration, /status = 'active'/);
  assert.match(migration, /revoke insert on public\.turns from authenticated/);
  assert.match(migration, /grant execute on function public\.append_chat_turn_event\(uuid, text, text, text\) to service_role/);
  assert.match(migration, /create function public\.cancel_chat_turn/);
});
