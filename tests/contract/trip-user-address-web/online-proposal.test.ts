import assert from "node:assert/strict";
import test from "node:test";
import { newAddressIntent, matchingAddressProposal, postAddressIntent, readAddressIntent, addressIntentSettled, addressReviewBlocked, abandonLocalAddressIntent, readAddressCurrent } from "../../../components/trip-address/online-proposal.ts";
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


test("only exact authoritative terminal token settles a handed intent; old epoch/reset/read-failure do not", () => {
  const draft = intent(); draft.receipt = { proposalId, revision: 1, baseTripVersion: 3 };
  for (const epoch of ["unsettled", "", `rejected:${actor}`, `applied:${actor}`])
    assert.equal(addressIntentSettled(draft, "handed", epoch, null), false);
  for (const epoch of [`applied:${proposalId}`, `rejected:${proposalId}`]) {
    assert.equal(addressIntentSettled(draft, "handed", epoch, null), true);
    assert.equal(addressIntentSettled(draft, "handed", epoch, proposalId), false);
    assert.equal(addressIntentSettled(draft, "unknown", epoch, null), false);
  }
  assert.equal(addressIntentSettled(intent(), "handed", `applied:${proposalId}`, null), false);
});

test("hidden address review blocks original Confirm including restored pending with no local ledger", () => {
  const read = matchingAddressProposal(pending(), intent())!;
  const reviewContext = { tripId: actor, snapshotTripId: actor, tripVersion: 3, items: [{ dayId: "day", itemId: "item" }] };
  assert.equal(addressReviewBlocked(read, false, reviewContext), true);
  assert.equal(addressReviewBlocked(read, true, reviewContext), false);
  assert.equal(addressReviewBlocked(null, false, reviewContext), false);
  const other = { ...read, proposal: { ...read.proposal, patch: { expectedVersion: 3, operations: [{ kind: "set_title" as const, title: "new title" }] } } };
  assert.equal(addressReviewBlocked(other, false, reviewContext), true); // Actual address changed even without a set operation.
  const unchanged = { ...other, proposal: { ...other.proposal, after: { ...other.proposal.before!, version: 4 } } };
  assert.equal(addressReviewBlocked(unchanged, false, reviewContext), false);
});


test("reload's new authoritative version with old nonstale pending keeps original Confirm locked", () => {
  const read = matchingAddressProposal(pending(), intent())!;
  const current = { tripId: actor, snapshotTripId: actor, tripVersion: 3, items: [{ dayId: "day", itemId: "item" }] };
  assert.equal(addressReviewBlocked(read, true, current), false);
  // reload() first publishes the v4 Trip; old pending base3 can still have stale:false until its GET resolves.
  assert.equal(addressReviewBlocked(read, true, { ...current, tripVersion: 4 }), true);
  assert.equal(addressReviewBlocked(read, true, { ...current, snapshotTripId: session }), true);
  assert.equal(addressReviewBlocked(read, true, { ...current, tripId: session }), true);
  assert.equal(addressReviewBlocked(read, true, { ...current, items: [] }), false);
  for (const change of [{ baseTripVersion: 2 }, { stale: true }, { digest: null }, { patch: { ...read.proposal.patch, expectedVersion: 4 } }, { after: { ...read.proposal.after, version: 5 } }]) {
    assert.equal(addressReviewBlocked({ ...read, proposal: { ...read.proposal, ...change } } as typeof read, true, current), true);
  }
});


test("changed-head current read remains GET-only and never settles or clears the original unknown bytes", async () => {
  const previous = globalThis.fetch, draft = intent(), originalBytes = draft.bytes;
  const record = { intent: draft, phase: "unknown" }, ledger = new Map([["same-scope", record]]);
  const calls: string[] = [];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => { calls.push(init?.method ?? "GET"); return Response.json({ trip: { id: actor, headVersion: 4 }, pending: null }); }) as typeof fetch;
  try {
    await readAddressCurrent(() => true, async () => { const response = await fetch(`/api/trips/${actor}`, { cache: "no-store", credentials: "same-origin" }); return response.json(); });
    assert.equal(ledger.get("same-scope"), record); assert.equal(record.phase, "unknown");
    assert.equal(draft.bytes, originalBytes); assert.equal(draft.receipt, null);
    assert.deepEqual(calls, ["GET"]);
  } finally { globalThis.fetch = previous; }
});

test("explicit local abandon clears only the confirmed same-scope unknown attempt and then reads without server undo", async () => {
  const previous = globalThis.fetch, draft = intent(), other = intent();
  const record = { intent: draft, phase: "unknown" }, sibling = { intent: other, phase: "unknown" };
  const ledger = new Map([["same-scope", record], ["other-scope", sibling]]), originalBytes = draft.bytes;
  assert.equal(abandonLocalAddressIntent(ledger, "same-scope", record, false, () => true), false);
  assert.equal(draft.bytes, originalBytes);
  assert.equal(abandonLocalAddressIntent(ledger, "same-scope", record, true, () => false), false); // Actor/route CAS changed.
  assert.equal(abandonLocalAddressIntent(ledger, "other-scope", record, true, () => true), false);
  assert.equal(ledger.size, 2);
  assert.equal(abandonLocalAddressIntent(ledger, "same-scope", record, true, () => true), true);
  assert.equal(ledger.has("same-scope"), false); assert.equal(draft.bytes, ""); assert.equal(ledger.get("other-scope"), sibling); assert.equal(other.bytes, originalBytes);
  const calls: string[] = [];
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => { calls.push(`${init?.method ?? "GET"} ${url}`); return Response.json({ trip: { headVersion: 4 } }); }) as typeof fetch;
  try {
    await readAddressCurrent(() => true, async () => fetch(`/api/trips/${actor}`, { credentials: "same-origin", cache: "no-store" }));
    assert.deepEqual(calls, [`GET /api/trips/${actor}`]);
    assert.equal(draft.receipt, null); assert.equal(record.phase, "unknown"); // No forged server outcome.
  } finally { globalThis.fetch = previous; }
});

test("current read refuses a new actor or route before callback and rejects late completion", async () => {
  let calls = 0;
  await assert.rejects(readAddressCurrent(() => false, async () => { calls++; }));
  assert.equal(calls, 0);
  let live = true;
  await assert.rejects(readAddressCurrent(() => live, async () => { calls++; live = false; return { trip: { headVersion: 4 } }; }), /CONTEXT_CHANGED/);
  assert.equal(calls, 1);
  const record = { intent: intent(), phase: "handed" }, ledger = new Map([["scope", record]]);
  assert.equal(abandonLocalAddressIntent(ledger, "scope", record, true, () => true), false);
  assert.equal(ledger.size, 1);
});


test("parent current reader receives the captured live predicate and may fence each await without clearing unknown", async () => {
  const draft = intent(), bytes = draft.bytes; let active = true, calls = 0;
  const live = () => active;
  const parentRead = async (current: () => boolean) => {
    assert.equal(current, live); assert.equal(current(), true); calls++;
    await Promise.resolve(); active = false;
    if (!current()) return null; // Parent must not publish old data after identity/route replacement.
    throw Error("must not publish");
  };
  await assert.rejects(readAddressCurrent(live, () => parentRead(live)), /CONTEXT_CHANGED/);
  assert.equal(calls, 1); assert.equal(draft.bytes, bytes); assert.equal(draft.receipt, null);
});
