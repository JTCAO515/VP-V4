import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("V4-09 feedback is owner-scoped, structured, and rejects arbitrary corrections", () => {
  const migration = readFileSync("supabase/migrations/20260828160000_v4_09_chat_feedback.sql", "utf8");
  assert.match(migration, /create table public\.turn_feedback/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on public\.turn_feedback from anon/);
  assert.match(migration, /reason_code text not null check/);
  assert.match(migration, /for update/);
  assert.match(migration, /NO_RESULT_TO_FEEDBACK/);
  assert.doesNotMatch(migration, /correction_text|message_body/i);
});
