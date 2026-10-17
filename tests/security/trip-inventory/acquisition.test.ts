import test from "node:test";
import assert from "node:assert/strict";
import { acquireH04TripInventory } from "../../../evals/harness/runtime-trip-inventory/index.ts";
import { inventoryDigest } from "../../../lib/server/trip/inventory/contract.ts";
import { boundary, snapshot, id } from "../../contract/trip-inventory/fixtures.ts";

test("untrusted/partial/foreign before never dispatches Ask or admits a task", async () => {
  for (const value of [null, {}, [], { ...snapshot(), complete: false }, { ...snapshot(), ownerId: id(20), digest: inventoryDigest(id(20), snapshot().trips) }, { ...snapshot(), count: null }, { ...snapshot(), count: 0 }, { ...snapshot(), trips: [] }]) {
    const f = boundary(); let posts = 0;
    const r = await acquireH04TripInventory(f.run, async (q, s) => { if (q.port === "submit") posts++; return q.port === "inventory" ? Response.json(value) : f.transport(q, s); });
    assert.equal(r.state, "NOT_RUN"); assert.equal(r.tripCollectionUnchanged, "unknown"); assert.equal(posts, 0); assert.equal(r.ask, null);
  }
});
test("owner/session/mobileEpoch changes before/after never become unchanged", async () => {
  for (const at of [1, 2, 3, 13]) for (const field of ["subject", "sessionId", "mobileEpoch"]) {
    const f = boundary(); let sessions = 0;
    const r = await acquireH04TripInventory(f.run, async (q, s) => {
      const response = await f.transport(q, s);
      if (q.port !== "session" || ++sessions !== at) return response;
      return Response.json({ ...await response.json(), [field]: field === "mobileEpoch" ? 2 : id(90) });
    });
    assert.equal(r.tripCollectionUnchanged, "unknown"); if (at <= 2) assert.equal(r.submitDispatches, 0);
  }
});
test("lost original ACK never causes a second submit; budgets include snapshots", async () => {
  const f = boundary(); const r = await acquireH04TripInventory(f.run, async (q, s) => { const r = await f.transport(q, s); if (q.port === "submit") throw Error("lost ACK"); return r; });
  assert.equal(r.ask?.acknowledgement, "unknown"); assert.equal(r.submitDispatches, 1); assert.equal(r.tripCollectionUnchanged, true);
  const g = boundary(); Object.assign(g.run, { bounds: { ...g.run.bounds, maxRequests: 3 } });
  const limited = await acquireH04TripInventory(g.run, g.transport); assert.equal(limited.submitDispatches, 0); assert.equal(limited.tripCollectionUnchanged, "unknown");
});
test("abort/deadline fences hung and late transport without private disclosure", async () => {
  for (const fault of ["abort", "deadline", "late", "hang-body"]) {
    const f = boundary(); Object.assign(f.run, { bounds: { ...f.run.bounds, timeoutMs: 25 } });
    const c = new AbortController();
    if (fault === "abort") setTimeout(() => c.abort(), 5);
    const r = await acquireH04TripInventory(f.run, async (q, s) => {
      if (q.port !== "inventory") return f.transport(q, s);
      if (fault === "late") { await new Promise(resolve => setTimeout(resolve, 50)); return Response.json(snapshot()); }
      if (fault === "hang-body") return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"PRIVATE TRIP":')); } }), { headers: { "Content-Type": "application/json" } });
      return new Promise<Response>(() => {});
    }, c.signal);
    assert.equal(r.tripCollectionUnchanged, "unknown"); assert.equal(r.submitDispatches, 0); assert.equal(r.before, null); assert.equal(r.after, null); assert.equal(r.state, "NOT_RUN"); assert.ok(!JSON.stringify(r).includes("PRIVATE TRIP"));
  }
});
test("oversize/redirect/invalid UTF8 and byte budget are unknown with zero submit", async () => {
  for (const kind of ["size", "utf8", "total", "mime"]) {
    const f = boundary(); if (kind === "total") Object.assign(f.run, { bounds: { ...f.run.bounds, maxResponseBytes: 300, maxTotalBytes: 300 } });
    const r = await acquireH04TripInventory(f.run, (q, s) => q.port !== "inventory" ? f.transport(q, s)
      : Promise.resolve(kind === "size" ? new Response("x", { headers: { "Content-Type": "application/json", "Content-Length": "262145" } })
        : kind === "utf8" ? new Response(new Uint8Array([255]), { headers: { "Content-Type": "application/json" } })
        : kind === "mime" ? new Response("{}", { headers: { "Content-Type": "text/html" } }) : Response.json(snapshot())));
    assert.equal(r.tripCollectionUnchanged, "unknown"); assert.equal(r.submitDispatches, 0);
  }
});
test("total-byte exhaustion during streamed submit permanently blocks recovery dispatch", async () => {
  const f = boundary(); Object.assign(f.run, { bounds: { ...f.run.bounds, maxTotalBytes: 8192, maxResponseBytes: 8192 } });
  const actual: string[] = []; let pulls = 0, cancelled = 0;
  const report = await acquireH04TripInventory(f.run, async (q, s) => {
    actual.push(q.port);
    if (q.port !== "submit") return f.transport(q, s);
    // Legal single-response cap, no Content-Length; prior successful before/session/policy reads
    // leave less than 8192 in the shared total. The second chunk exhausts that total.
    return new Response(new ReadableStream<Uint8Array>({
      pull(controller) { pulls++; if (pulls <= 2) controller.enqueue(new Uint8Array(4096).fill(120)); else controller.close(); },
      cancel() { cancelled++; },
    }, { highWaterMark: 0 }), { status: 201, headers: { "Content-Type": "application/json" } });
  });
  const submit = actual.indexOf("submit"); assert.ok(submit > 3, "complete before and original pre-submit reads succeeded");
  assert.deepEqual(actual.slice(submit + 1), [], "no actual transport call after total-byte exhaustion, including original driver recovery");
  assert.equal(actual.filter(p => p === "submit").length, 1); assert.equal(pulls, 2); assert.equal(cancelled, 1);
  assert.equal(report.ask?.acknowledgement, "unknown"); assert.equal(report.submitDispatches, 1);
  assert.equal(report.tripCollectionUnchanged, "unknown"); assert.equal(report.after, null);
});
