import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createTripInventoryReader } from "../../../lib/server/trip/inventory/reader.ts";
import { id } from "../../contract/trip-inventory/fixtures.ts";
const header = { id: id(8), title: "Secret", headVersion: 0, updatedAt: "2026-10-16T00:00:00Z" };
const canonical = { trip: header, content: { days: [] }, confirmationState: "initial" as const };
const client = (owner = id(1), head = 0) => ({ from() { return { select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; }, abortSignal() { return Promise.resolve({ count: 1, data: [{ id: header.id, owner_id: owner, head_version: head, title: header.title, updated_at: header.updatedAt }] }); } }; } }) as unknown as SupabaseClient;
test("foreign row, changed authority and unreadable canonical are all closed", async () => {
  assert.deepEqual(await createTripInventoryReader(client(id(9)), async () => ({ data: id(1) }), async () => ({ data: canonical }))(), { error: "PROVIDER_UNAVAILABLE" });
  let calls = 0;
  assert.deepEqual(await createTripInventoryReader(client(), async () => ({ data: ++calls === 1 ? id(1) : id(2) }), async () => ({ data: canonical }))(), { error: "UNAUTHENTICATED" });
  assert.deepEqual(await createTripInventoryReader(client(), async () => ({ data: id(1) }), async () => ({ error: "FORBIDDEN" }))(), { error: "PROVIDER_UNAVAILABLE" });
});
test("abort interrupts canonical await and a late reply never yields content", async () => {
  const c = new AbortController(); setTimeout(() => c.abort(), 5);
  const r = await createTripInventoryReader(client(), async () => ({ data: id(1) }), async () => { await new Promise(resolve => setTimeout(resolve, 30)); return { data: canonical }; })(c.signal);
  assert.deepEqual(r, { error: "PROVIDER_UNAVAILABLE" });
});
