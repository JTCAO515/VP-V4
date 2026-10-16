import test from "node:test";
import assert from "node:assert/strict";
import { acquireH04TripInventory } from "../../../evals/harness/runtime-trip-inventory/index.ts";
import { createNativeInventoryTransport } from "../../../evals/harness/runtime-trip-inventory/transport.ts";
import { boundary, snapshot } from "./fixtures.ts";

test("H04 complete acquisition composes original driver once and reports metadata only", async () => {
  const f = boundary(), r = await acquireH04TripInventory(f.run, f.transport);
  assert.equal(r.state, "observed"); assert.equal(r.tripCollectionUnchanged, true); assert.equal(r.ask?.outcome, "clarification"); assert.equal(r.submitDispatches, 1);
  const submitted = f.requests.find(r => r.port === "submit"); assert.ok(submitted && submitted.port !== "inventory"); assert.deepEqual(submitted.body, f.run.submission);
  assert.deepEqual(f.requests.slice(0, 3).map(r => r.port), ["session", "inventory", "session"]);
  assert.deepEqual(f.requests.slice(-3).map(r => r.port), ["session", "inventory", "session"]);
  for (const text of ["PRIVATE TRIP", "PRIVATE REQUEST", "PRIVATE NOTICE"]) assert.ok(!JSON.stringify(r).includes(text));
  assert.equal(r.originAuthentication, "unknown"); assert.equal(r.requiredModeVerdict, "NOT_RUN"); assert.equal(r.finalAcceptance, "NOT_RUN");
});
test("changed current canonical tuple is reported changed", async () => {
  const f = boundary(); let reads = 0;
  const r = await acquireH04TripInventory(f.run, (q, s) => q.port === "inventory" ? Promise.resolve(Response.json(snapshot(reads++))) : f.transport(q, s));
  assert.equal(r.tripCollectionUnchanged, false); assert.equal(r.state, "observed");
});
test("Native transport is explicit allowed HTTPS GET with redirect error and no fallback", async () => {
  const requests: [string, RequestInit | undefined][] = [];
  const transport = createNativeInventoryTransport({ allowedOrigin: "https://example.invalid", authorizedFetch: async (url, init) => { requests.push([String(url), init]); return Response.json(snapshot()); } });
  await transport({ port: "inventory" }, new AbortController().signal);
  assert.equal(requests[0][0], "https://example.invalid/api/trips/native/v2/inventory");
  assert.equal(requests[0][1]?.method, "GET"); assert.equal(requests[0][1]?.redirect, "error"); assert.equal(requests[0][1]?.cache, "no-store");
  for (const origin of ["http://example.invalid", "https://example.invalid/path", "https://user@example.invalid"]) assert.throws(() => createNativeInventoryTransport({ allowedOrigin: origin, authorizedFetch: fetch }));
});
