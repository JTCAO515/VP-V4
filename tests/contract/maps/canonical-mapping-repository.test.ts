import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { loadCanonicalMappingLookup } from "../../../lib/server/maps/canonical-mapping-repository.ts";

function clientWithFetch(fetchImpl: typeof fetch) {
  return createClient("https://synthetic.invalid", "synthetic-service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchImpl },
  });
}

test("empty id list never dispatches a request and returns an always-null lookup", async () => {
  const client = clientWithFetch(async () => {
    throw new Error("must not call");
  });
  const { lookupMapping, dbError } = await loadCanonicalMappingLookup(client, "amap", []);
  assert.equal(dbError, false);
  assert.equal(lookupMapping("amap", "B0001"), null);
});

test("queries provider_poi_mappings scoped to the given provider and ids, deduped", async () => {
  let seenUrl: URL | undefined;
  let calls = 0;
  const client = clientWithFetch(async (input) => {
    calls++;
    seenUrl = new URL(String(input));
    return new Response(
      JSON.stringify([
        { provider_poi_id: "B0001", canonical_poi_id: "3a683bd8-a757-42df-ae89-27c2e28c8dc7" },
      ]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });
  const { lookupMapping, dbError } = await loadCanonicalMappingLookup(client, "amap", ["B0001", "B0002", "B0001"]);
  assert.equal(calls, 1);
  assert.equal(seenUrl!.pathname, "/rest/v1/provider_poi_mappings");
  assert.equal(seenUrl!.searchParams.get("provider"), "eq.amap");
  assert.equal(seenUrl!.searchParams.get("provider_poi_id"), "in.(B0001,B0002)");
  assert.equal(dbError, false);
  assert.equal(lookupMapping("amap", "B0001"), "3a683bd8-a757-42df-ae89-27c2e28c8dc7");
  assert.equal(lookupMapping("amap", "B0002"), null);
  assert.equal(lookupMapping("tencent", "B0001"), null);
});

test("a mismatched provider argument never returns another provider's match", async () => {
  const client = clientWithFetch(async () =>
    new Response(
      JSON.stringify([{ provider_poi_id: "t1", canonical_poi_id: "c6864370-ddec-4eef-9a7c-927151351102" }]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  const { lookupMapping } = await loadCanonicalMappingLookup(client, "tencent", ["t1"]);
  assert.equal(lookupMapping("tencent", "t1"), "c6864370-ddec-4eef-9a7c-927151351102");
  assert.equal(lookupMapping("amap", "t1"), null);
});

test("a DB/transport error collapses to dbError:true and every lookup answers null, never throws", async () => {
  const client = clientWithFetch(async () =>
    new Response(JSON.stringify({ code: "42501", message: "SECRET_CANARY" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    }),
  );
  const { lookupMapping, dbError } = await loadCanonicalMappingLookup(client, "amap", ["B0001"]);
  assert.equal(dbError, true);
  assert.equal(lookupMapping("amap", "B0001"), null);
});

test("a thrown transport failure also collapses to dbError:true rather than rejecting", async () => {
  const client = clientWithFetch(async () => {
    throw new Error("secret URL leaked");
  });
  const { lookupMapping, dbError } = await loadCanonicalMappingLookup(client, "amap", ["B0001"]);
  assert.equal(dbError, true);
  assert.equal(lookupMapping("amap", "B0001"), null);
});

test("malformed rows (missing/wrong-typed fields) are skipped rather than crashing or matching", async () => {
  const client = clientWithFetch(async () =>
    new Response(
      JSON.stringify([
        { provider_poi_id: "B0001" },
        { canonical_poi_id: "3a683bd8-a757-42df-ae89-27c2e28c8dc7" },
        { provider_poi_id: 5, canonical_poi_id: "3a683bd8-a757-42df-ae89-27c2e28c8dc7" },
        null,
        { provider_poi_id: "B0002", canonical_poi_id: "3a683bd8-a757-42df-ae89-27c2e28c8dc7" },
      ]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  const { lookupMapping, dbError } = await loadCanonicalMappingLookup(client, "amap", ["B0001", "B0002"]);
  assert.equal(dbError, false);
  assert.equal(lookupMapping("amap", "B0001"), null);
  assert.equal(lookupMapping("amap", "B0002"), "3a683bd8-a757-42df-ae89-27c2e28c8dc7");
});

test("ids longer than the migration's 128-char bound are dropped from the query rather than sent", async () => {
  let seenUrl: URL | undefined;
  const client = clientWithFetch(async (input) => {
    seenUrl = new URL(String(input));
    return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  await loadCanonicalMappingLookup(client, "amap", ["x".repeat(129), "B0001"]);
  assert.equal(seenUrl!.searchParams.get("provider_poi_id"), "in.(B0001)");
});
