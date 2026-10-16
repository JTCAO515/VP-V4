import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createTripInventoryReader } from "../../../lib/server/trip/inventory/reader.ts";
import { inventoryDigest, parseInventory } from "../../../lib/server/trip/inventory/contract.ts";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = { id: id(2), title: "Private title", head_version: 0, updated_at: "2026-10-16T00:00:00Z" };
function fixture(replies: unknown[] = [{ data: [row], count: 1, error: null }, { data: [row], count: 1, error: null }]) {
  const calls: unknown[] = []; let auth = 0;
  const client = { from(table: string) { calls.push(table); return { select(columns: string, options: unknown) { calls.push([columns, options]); return { order(key: string, options: unknown) { calls.push([key, options]); return { limit(n: number) { calls.push(n); return { abortSignal() { return Promise.resolve(replies.shift()); } }; } }; } }; } }; } } as unknown as SupabaseClient;
  const canonical = { trip: { id: row.id, title: row.title, headVersion: 0, updatedAt: row.updated_at }, content: { days: [] }, confirmationState: "initial" as const };
  return { calls, canonical, read: (read = async () => ({ data: canonical }), authenticate = async () => { auth++; return { data: id(1) }; }) => createTripInventoryReader(client, authenticate, read), get auth() { return auth; } };
}
test("ordinary bound client uses exact count, stable id, canonical zero and two reads", async () => {
  const f = fixture(), result = await f.read()(); assert.ok("data" in result);
  assert.equal(result.data.count, 1); assert.equal(result.data.complete, true); assert.equal(result.data.ownerId, id(1)); assert.equal(f.auth, 2);
  assert.deepEqual(f.calls, ["trips", ["id,title,head_version,updated_at", { count: "exact" }], ["id", { ascending: true }], 9, "trips", ["id,title,head_version,updated_at", { count: "exact" }], ["id", { ascending: true }], 9]);
  assert.deepEqual(parseInventory(result.data), result.data);
});
test("only exact zero counts with non-null arrays can be empty complete", async () => {
  const f = fixture([{ data: [], count: 0 }, { data: [], count: 0 }]); const r = await f.read()(); assert.ok("data" in r); assert.equal(r.data.count, 0);
});
for (const [name, reply] of Object.entries({ nullCount: { data: [], count: null }, nullRows: { data: null, count: 0 }, truncatedZero: { data: [row], count: 0 }, missingPage: { data: [], count: 1 }, cap: { data: [row], count: 9 }, duplicate: { data: [row, row], count: 2 }, negative: { data: [], count: -1 }, badHead: { data: [{ ...row, head_version: -1 }], count: 1 } }))
  test(name + " cannot publish any partial inventory", async () => { assert.deepEqual(await fixture([reply]).read()(), { error: "PROVIDER_UNAVAILABLE" }); });
test("set, version, title, updatedAt changes and canonical mismatches fail closed", async () => {
  for (const patch of [{ head_version: 2 }, { title: "Changed" }, { updated_at: "2026-10-16T01:00:00Z" }, { id: id(3) }]) {
    assert.deepEqual(await fixture([{ data: [row], count: 1 }, { data: [{ ...row, ...patch }], count: 1 }]).read()(), { error: "PROVIDER_UNAVAILABLE" });
  }
  const f = fixture(); f.canonical.trip.headVersion = 1; assert.deepEqual(await f.read()(), { error: "PROVIDER_UNAVAILABLE" });
});
test("closed parser rejects extra data, wrong hash/version, unsorted IDs and oversize", async () => {
  const r = await fixture().read()(); assert.ok("data" in r); const good = r.data;
  for (const bad of [{ ...good, hidden: "secret" }, { ...good, digest: "0".repeat(64) }, { ...good, schemaVersion: "other" }, { ...good, ownerId: id(8) }, { ...good, trips: [{ ...good.trips[0], content: { days: [], history: [] } }] }]) assert.equal(parseInventory(bad), null);
  const trips = [{ ...good.trips[0], content: { days: [{ id: "d", date: "2026-10-16", items: Array.from({ length: 2000 }, (_, n) => ({ id: "i" + n, dayId: "d", title: "x".repeat(160) })) }] } }];
  assert.equal(parseInventory({ ...good, trips, digest: inventoryDigest(good.ownerId, trips) }), null);
});
