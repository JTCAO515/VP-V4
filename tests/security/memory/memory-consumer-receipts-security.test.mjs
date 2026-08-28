import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("V4-15 durable Memory consumer receipts are owner-scoped and cannot be client-forged", () => {
  const migration = readFileSync("supabase/migrations/20260828194000_v4_15_memory_consumer_receipts.sql", "utf8");
  assert.match(migration, /create table public\.memory_consumer_receipts/);
  assert.match(migration, /memory_id uuid not null references public\.memory_profiles\(id\) on delete restrict/);
  assert.match(migration, /source_receipt_id uuid not null references public\.memory_receipts\(id\) on delete restrict/);
  assert.match(migration, /turns_id_owner_unique unique \(id, owner_id\)/);
  assert.match(migration, /trip_proposals_id_owner_unique unique \(id, owner_id\)/);
  assert.match(migration, /foreign key \(turn_id, owner_id\) references public\.turns\(id, owner_id\) on delete cascade/);
  assert.match(migration, /foreign key \(proposal_id, owner_id\) references public\.trip_proposals\(id, owner_id\) on delete cascade/);
  assert.match(migration, /check \(\(turn_id is not null\)::integer \+ \(proposal_id is not null\)::integer = 1\)/);
  assert.match(migration, /alter table public\.memory_consumer_receipts enable row level security/);
  assert.match(migration, /revoke all on public\.memory_consumer_receipts from anon/);
  assert.match(migration, /grant select on public\.memory_consumer_receipts to authenticated/);
  assert.doesNotMatch(migration, /grant (insert|update|delete) on public\.memory_consumer_receipts to authenticated/);
  assert.match(migration, /memory consumer receipt owner selects/);
});
