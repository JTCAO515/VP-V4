import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("V4-13 Memory Profile is owner-scoped, receipt-backed, and excludes unsafe retrieval states", () => {
  const migration = readFileSync("supabase/migrations/20260828193000_v4_13_memory_profile.sql", "utf8");
  for (const table of ["memory_consents", "memory_profiles", "memory_receipts"]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on public\\.${table} from anon`));
    assert.match(migration, new RegExp(`${table.slice(0, -1).replace("_", " ")} owner selects`));
  }
  assert.match(migration, /foreign key \(source_receipt_id\) references public\.memory_receipts\(id\) deferrable initially deferred/);
  assert.match(migration, /check \(constraint_kind <> 'hard_constraint' or state <> 'inferred'\)/);
  assert.match(migration, /if \(select auth\.uid\(\)\) is null then raise exception 'FORBIDDEN'/);
  assert.match(migration, /CONSENT_REQUIRED/);
  assert.match(migration, /TERMINAL_MEMORY/);
  assert.match(migration, /exists \(select 1 from public\.memory_profiles where id = p_memory_id\)[\s\S]*exists \(select 1 from public\.memory_receipts where id = p_receipt_id\)[\s\S]*raise exception 'FORBIDDEN'/);
  assert.match(migration, /memory\.state in \('explicit', 'confirmed'\)/);
  assert.match(migration, /consent\.status = 'granted'/);
  assert.doesNotMatch(migration, /grant (insert|update|delete) on public\.memory_(consents|profiles|receipts) to authenticated/);
});
