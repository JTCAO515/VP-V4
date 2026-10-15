import assert from "node:assert/strict";
import test from "node:test";
import { userProvidedAddress } from "../../../lib/trip-user-address.ts";
import { addressBindingKey, readCurrentAddressBinding } from "../../../components/trip-address/current-binding.ts";
import { addressProposalChanges } from "../../../components/trip-address/review.ts";
import { addressReviewBlocked } from "../../../components/trip-address/online-proposal.ts";
import type { LocalTripRead } from "../../../components/canvas/TripContentEditor.tsx";
import type { PendingProposalRead } from "../../../lib/server/identity/user-data-adapter.ts";
const id = "11111111-1111-4111-8111-111111111111", pid = "22222222-2222-4222-8222-222222222222";
const rootA = { identity: "A:session", key: "A:session:1", expiresAt: Date.now() + 60000 };
const address = userProvidedAddress("  上海 A座\n ");
const item = (dayId: string, withAddress = true) => ({ id: "item", dayId, title: "Place", ...(withAddress ? { chineseAddress: address } : {}) });
function data(): LocalTripRead { return { trip: { id, title: "Trip", headVersion: 3, updatedAt: "2026-10-15T00:00:00Z" }, confirmationState: "confirmed", content: { days: [{ id: "A", date: "2026-10-16", items: [item("A")] }] } }; }
function pending(before = [item("A")], after = [item("A", false)]): PendingProposalRead {
  return { trip: data().trip, proposal: { id: pid, revision: 1, baseTripVersion: 3, status: "pending", stale: false, digest: "a".repeat(64), createdAt: "2026-10-15T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z", titleDiff: { before: "Trip", after: "Trip" }, evidence: "not_recorded", assumptions: "not_recorded", patch: { expectedVersion: 3, operations: [{ kind: "delete_day", dayId: "A" }, { kind: "upsert_day", dayId: "A", date: "2026-10-16" }] }, before: { version: 3, title: "Trip", days: [{ id: "A", date: "2026-10-16", items: before }] }, after: { version: 4, title: "Trip", days: [{ id: "A", date: "2026-10-16", items: after }] } } };
}

test("current claims root must GET original Trip and exact pending before parent data receives a display lease", async () => {
  const previous = globalThis.fetch, calls: string[] = [], p = pending(), d = data();
  globalThis.fetch = (async (url: unknown, options?: RequestInit) => { calls.push(String(url)); assert.equal(options?.credentials, "same-origin"); assert.equal(options?.cache, "no-store"); return Response.json(calls.length === 1 ? d : p); }) as typeof fetch;
  try {
    const lease = await readCurrentAddressBinding(rootA, id, d, p, new AbortController().signal, () => rootA);
    assert.deepEqual(lease, { actorKey: rootA.key, inputKey: addressBindingKey(id, d, p) });
    assert.deepEqual(calls, [`/api/trips/${id}`, `/api/trips/${id}/proposal?proposalId=${pid}`]);
  } finally { globalThis.fetch = previous; }
});

test("A payload cannot reappear under B claims when B's real Cookie Trip read is denied; returning A must reread", async () => {
  const previous = globalThis.fetch, d = data(), p = pending(), rootB = { ...rootA, identity: "B:session", key: "B:session:2" };
  const calls: string[] = [];
  globalThis.fetch = (async (url: unknown) => { calls.push(String(url)); return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 }); }) as typeof fetch;
  try {
    await assert.rejects(readCurrentAddressBinding(rootB, id, d, p, new AbortController().signal, () => rootB));
    assert.equal(calls.length, 1);
    const nextA = { ...rootA, key: "A:session:3" }; let count = 0;
    globalThis.fetch = (async () => Response.json(++count === 1 ? d : p)) as typeof fetch;
    const lease = await readCurrentAddressBinding(nextA, id, d, p, new AbortController().signal, () => nextA);
    assert.equal(count, 2); assert.equal(lease.actorKey, nextA.key); assert.notEqual(lease.actorKey, rootA.key);
  } finally { globalThis.fetch = previous; }
});

test("same-session revalidation also rereads and late root/version/digest changes cannot reuse a lease", async () => {
  const previous = globalThis.fetch, d = data(), p = pending(); let live = rootA;
  globalThis.fetch = (async () => { live = { ...rootA, key: "new-generation" }; return Response.json(d); }) as typeof fetch;
  try {
    await assert.rejects(readCurrentAddressBinding(rootA, id, d, p, new AbortController().signal, () => live), /ROOT_CHANGED/);
    globalThis.fetch = (async () => Response.json({ ...d, trip: { ...d.trip, headVersion: 4 } })) as typeof fetch;
    await assert.rejects(readCurrentAddressBinding(rootA, id, d, p, new AbortController().signal, () => rootA));
    let count = 0;
    globalThis.fetch = (async () => Response.json(++count === 1 ? d : { ...p, proposal: { ...p.proposal, digest: "b".repeat(64) } })) as typeof fetch;
    await assert.rejects(readCurrentAddressBinding(rootA, id, d, p, new AbortController().signal, () => rootA));
    assert.notEqual(addressBindingKey(id, d, p), addressBindingKey(id, d, { ...p, proposal: { ...p.proposal, revision: 2 } }));
  } finally { globalThis.fetch = previous; }
});

test("no-pending display lease requires exact authoritative absence, never generic transport/409 failure", async () => {
  const previous = globalThis.fetch, d = data();
  try {
    for (const code of ["PROVIDER_UNAVAILABLE", "PROPOSAL_NOT_CONFIRMABLE"]) {
      let count = 0;
      globalThis.fetch = (async () => ++count === 1 ? Response.json(d) : Response.json({ error: { code } }, { status: 409 })) as typeof fetch;
      const result = readCurrentAddressBinding(rootA, id, d, null, new AbortController().signal, () => rootA);
      if (code === "PROPOSAL_NOT_CONFIRMABLE") assert.equal((await result).actorKey, rootA.key);
      else await assert.rejects(result);
    }
  } finally { globalThis.fetch = previous; }
});

test("rollback clearing without setop renders removal from actual before/after", () => {
  const p = pending(), projection = addressProposalChanges(p, { tripId: id, tripVersion: 3 });
  assert.equal(projection.kind, "ready");
  if (projection.kind !== "ready") return;
  assert.equal(projection.changes.length, 1); assert.equal(projection.changes[0].before.kind, "provided"); assert.equal(projection.changes[0].after.kind, "missing");
  assert.equal(addressReviewBlocked(p, true, { tripId: id, snapshotTripId: id, tripVersion: 3, items: [] }), false);
  assert.equal(addressReviewBlocked(p, false, { tripId: id, snapshotTripId: id, tripVersion: 3, items: [] }), true);
});

test("restored deleted address item and cross-day move review use union of original snapshots, not current-item existence", () => {
  const restored = pending([], [item("A")]);
  const result = addressProposalChanges(restored, { tripId: id, tripVersion: 3 });
  assert.equal(result.kind, "ready"); if (result.kind === "ready") { assert.equal(result.changes[0].before.kind, "missing"); assert.equal(result.changes[0].after.kind, "provided"); }
  assert.equal(addressReviewBlocked(restored, true, { tripId: id, snapshotTripId: id, tripVersion: 3, items: [] }), false);
  const moved = { ...pending(), proposal: { ...pending().proposal, after: { version: 4, title: "Trip", days: [{ id: "B", date: "2026-10-17", items: [item("B")] }] } } };
  const projection = addressProposalChanges(moved, { tripId: id, tripVersion: 3 });
  assert.equal(projection.kind, "ready"); if (projection.kind === "ready") assert.deepEqual(projection.changes.map(change => [change.dayId, change.before.kind, change.after.kind]), [["A", "provided", "missing"], ["B", "missing", "provided"]]);
  assert.equal(addressReviewBlocked(moved, true, { tripId: id, snapshotTripId: id, tripVersion: 3, items: [{ dayId: "A", itemId: "item" }] }), false);
});
