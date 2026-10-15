import assert from "node:assert/strict";
import test from "node:test";
import { newAddressIntent, matchingAddressProposal, postAddressIntent, readAddressIntent } from "../../../components/trip-address/online-proposal.ts";
import { AddressActorGate } from "../../../components/trip-address/actor.ts";
const actor = "11111111-1111-4111-8111-111111111111", session = "22222222-2222-4222-8222-222222222222", proposalId = "33333333-3333-4333-8333-333333333333";
const context = { actorKey: `${actor}:${session}:1`, tripId: actor, tripVersion: 3, dayId: "day", itemId: "item" };
const text = " 上海 A座\n ";
const intent = () => newAddressIntent(`${actor}:${session}`, context, text);
function pending() {
  const item = { id: "item", dayId: "day", title: "Place" };
  return { trip: { id: actor, headVersion: 3 }, proposal: { id: proposalId, revision: 1, baseTripVersion: 3, status: "pending", stale: false, digest: "a".repeat(64), expiresAt: "2099-01-01T00:00:00.000Z", patch: JSON.parse(intent().bytes).patch,
    before: { version: 3, days: [{ id: "day", items: [item] }] }, after: { version: 4, days: [{ id: "day", items: [{ ...item, chineseAddress: { text, source: "user_provided", verification: "unverified" } }] }] } } };
}

test("real Cookie prepare POST preserves exact body then reads exact receipt id without confirm", async () => {
  const original = globalThis.fetch, calls: { url: string; init?: RequestInit }[] = [];
  const draft = intent(), signal = new AbortController().signal;
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return Response.json(calls.length === 1 ? { proposalId, revision: 1, baseTripVersion: 3 } : pending());
  }) as typeof fetch;
  try {
    await postAddressIntent(draft, signal, () => true);
    const read = await readAddressIntent(draft, signal, () => true);
    assert.equal(read.proposal.id, proposalId);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].init?.method, "POST"); assert.equal(calls[0].init?.body, draft.bytes);
    assert.equal(calls[0].init?.credentials, "same-origin"); assert.equal(calls[0].init?.signal, signal);
    assert.deepEqual(calls[0].init?.headers, { "content-type": "application/json" });
    assert.equal(calls[1].url, `/api/trips/${actor}/proposal?proposalId=${proposalId}`);
    assert.equal(calls[1].init?.method, undefined); assert.equal(calls[1].init?.cache, "no-store");
    assert.ok(calls.every(call => !call.url.includes("/confirm")));
  } finally { globalThis.fetch = original; }
});

test("unknown POST recovery only GETs and never clears original bytes or fabricates receipt on empty read", async () => {
  const original = globalThis.fetch, calls: RequestInit[] = [], draft = intent(), bytes = draft.bytes;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => { calls.push(init!); if (init?.method === "POST") throw Error("lost ACK"); return Response.json({ error: "not ready" }, { status: 409 }); }) as typeof fetch;
  try {
    await assert.rejects(postAddressIntent(draft, new AbortController().signal, () => true), /lost ACK/);
    await assert.rejects(readAddressIntent(draft, new AbortController().signal, () => true));
    assert.equal(draft.bytes, bytes); assert.equal(draft.receipt, null);
    assert.deepEqual(calls.map(call => call.method ?? "GET"), ["POST", "GET"]);
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => { calls.push(init!); return Response.json(pending()); }) as typeof fetch;
    assert.equal((await readAddressIntent(draft, new AbortController().signal, () => true)).proposal.id, proposalId);
    assert.deepEqual(calls.map(call => call.method ?? "GET"), ["POST", "GET", "GET"]);
  } finally { globalThis.fetch = original; }
});

test("original pending validation rejects wrong receipt/revision/base/digest/extra ops/forged after", () => {
  assert.ok(matchingAddressProposal(pending(), intent()));
  for (const fields of [{ id: actor }, { revision: 2 }, { baseTripVersion: 2 }, { digest: "invalid" }, { status: "confirmed" }, { stale: true }, { expiresAt: "2000-01-01T00:00:00.000Z" }]) {
    const draft = intent(); draft.receipt = { proposalId, revision: 1, baseTripVersion: 3 };
    assert.equal(matchingAddressProposal({ ...pending(), proposal: { ...pending().proposal, ...fields } }, draft), null);
  }
  const raw = pending(); raw.proposal.patch.operations.push(raw.proposal.patch.operations[0]);
  assert.equal(matchingAddressProposal(raw, intent()), null);
  const forged = pending(); forged.proposal.after.days[0].items[0].chineseAddress.verification = "verified";
  assert.equal(matchingAddressProposal(forged, intent()), null);
});

test("actor/route replacement after await cannot adopt a POST receipt or pending diff", async () => {
  const original = globalThis.fetch, draft = intent(); let live = true;
  globalThis.fetch = (async () => { live = false; return Response.json({ proposalId, revision: 1, baseTripVersion: 3 }); }) as typeof fetch;
  try { await assert.rejects(postAddressIntent(draft, new AbortController().signal, () => live), /CONTEXT_CHANGED/); assert.equal(draft.receipt, null); }
  finally { globalThis.fetch = original; }
});

test("verified claims create ephemeral sub/session/generation root; unknown and late claims cannot restore it", async () => {
  const events: unknown[] = [], gate = new AddressActorGate(value => events.push(value));
  const claims = { error: null, data: { claims: { sub: actor, session_id: session, role: "authenticated", exp: Date.now() / 1000 + 60 } } };
  await gate.verify(async () => claims); const first = gate.current()!;
  assert.equal(first.identity, `${actor}:${session}`);
  gate.invalidate(); assert.equal(gate.current(), null);
  await gate.verify(async () => claims); assert.notEqual(gate.current()?.key, first.key);
  await gate.verify(async () => ({ error: Error("unknown") })); assert.equal(gate.current(), null);
  let finish!: (value: unknown) => void;
  const checking = gate.verify(() => new Promise(resolve => { finish = resolve; }));
  gate.invalidate(); finish(claims); await checking; assert.equal(gate.current(), null);
  for (const changed of [{ session_id: undefined }, { sub: "unknown" }, { role: "anon" }, { is_anonymous: true }, { exp: 1 }]) {
    await gate.verify(async () => ({ ...claims, data: { claims: { ...claims.data.claims, ...changed } } }));
    assert.equal(gate.current(), null);
  }
  gate.invalidate(); assert.equal(events.at(-1), null);
});

test("claims expiry and 8s unknown claims timeout invalidate without late restore", async t => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1800000000000 });
  const changes: unknown[] = [], gate = new AddressActorGate(value => changes.push(value));
  const claims = { error: null, data: { claims: { sub: actor, session_id: session, role: "authenticated", exp: Date.now() / 1000 + 1 } } };
  await gate.verify(async () => claims); assert.ok(gate.current());
  t.mock.timers.tick(1001); assert.equal(gate.current(), null); assert.equal(changes.at(-1), null);
  let resolve!: (value: unknown) => void;
  const late = gate.verify(() => new Promise(r => { resolve = r; }));
  t.mock.timers.tick(8001);
  resolve({ ...claims, data: { claims: { ...claims.data.claims, exp: Date.now() / 1000 + 60 } } }); await late;
  assert.equal(gate.current(), null); gate.invalidate();
});
