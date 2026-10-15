import assert from "node:assert/strict";
import test from "node:test";
import { classifyChineseAddressLines } from "../../../lib/trip-user-address.ts";
import { addressOperation, sameAddressContext } from "../../../components/trip-address/context.ts";
import { decodeAddressRead, readOnlineAddresses } from "../../../components/trip-address/read.ts";
import { AddressReadController, type AddressState } from "../../../components/trip-address/controller.ts";
import { prepareAddress } from "../../../components/trip-address/proposal.ts";
const context = { actorKey: "session-A", tripId: "11111111-1111-4111-8111-111111111111", tripVersion: 3, dayId: "day1", itemId: "item1" };
const id = "22222222-2222-4222-8222-222222222222";
const hash = "a".repeat(64);
function wire() {
  return { kind: "addresses", context: { tripId: context.tripId, tripVersion: 3, dayId: "day1", itemId: "item1" }, userProvided: { kind: "missing" },
    reference: { kind: "qualified", entries: [{ chineseText: "contains_chinese_text", expiresAt: "2099-01-01T00:00:00.000Z", supportId: id, receiptId: id, placeReferenceId: id, version: 1, scope: "address_reference", status: "reference_current", applicability: "matched", claimRevision: 1, payloadHash: hash, sourceDigest: hash, sourceRefs: [{ sourceRevisionId: id, revisionLabel: "Reviewed source", snippetHash: hash }], claim: { claimType: "address", subjectId: id, asOf: "2026-10-15T00:00:00.000Z", value: { lines: ["上海市示例路 1 号"], countryCode: "CN" }, evidence: [{ kind: "fact", factId: id, version: 1, reviewedAt: "2026-10-15T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z" }] } }] } };
}

test("current source and manual addition retain separate provenance and original bytes", () => {
  const raw = wire();
  const text = "  上海\nA座  ";
  const value = decodeAddressRead({ ...raw, userProvided: { kind: "provided", address: { text, source: "user_provided", verification: "unverified" } } }, context)!;
  assert.equal(value.manual.kind, "provided");
  if (value.manual.kind === "provided") assert.equal(value.manual.address.text, text);
  assert.equal(value.references[0].chineseText, "contains_chinese_text");
  assert.deepEqual(value.references[0].claim, raw.reference.entries[0].claim);
  assert.equal(decodeAddressRead({ ...raw, userProvided: { kind: "provided", address: { text, source: "user_provided", verification: "verified" } } }, context), null);
});

test("country/title do not grant Chinese observation and ambiguous lines stay unknown", () => {
  for (const [lines, observation] of [[["1 Example Road"], "not_chinese"], [["上海 テスト"], "unknown"]] as const) {
    const raw = wire(); raw.reference.entries[0].claim.value.lines = [...lines]; raw.reference.entries[0].chineseText = classifyChineseAddressLines(lines);
    assert.equal(decodeAddressRead({ ...raw, title: "上海" }, context)?.references[0].chineseText, observation);
  }
});

test("stale versions/items, missing evidence, revoked, unmatched and expired sources fail closed", () => {
  for (const change of [{ tripVersion: 2 }, { tripId: id }, { dayId: "other" }, { itemId: "other" }]) assert.equal(decodeAddressRead({ ...wire(), context: { ...wire().context, ...change } }, context), null);
  const raw = wire();
  raw.reference.entries[0].claim.evidence = [];
  assert.equal(decodeAddressRead(raw, context)?.references.length, 0);
  for (const status of ["revoked", "recheck_required", "blocked"]) {
    const raw = wire(); raw.reference.entries[0].status = status;
    assert.equal(decodeAddressRead(raw, context), null);
  }
  const unmatched = wire(); unmatched.reference.entries[0].applicability = "unverified";
  assert.equal(decodeAddressRead(unmatched, context), null);
  assert.equal(decodeAddressRead(wire(), context, Date.parse("2100-01-01"))?.referencesUnavailable, true);
  const forgedObservation = wire(); forgedObservation.reference.entries[0].chineseText = "not_chinese";
  assert.equal(decodeAddressRead(forgedObservation, context), null);
  const extendedExpiry = wire(); extendedExpiry.reference.entries[0].expiresAt = "2099-02-01T00:00:00.000Z";
  assert.equal(decodeAddressRead(extendedExpiry, context)?.referencesUnavailable, true);
  for (const kind of ["conflict", "blocked", "unavailable"]) assert.equal(decodeAddressRead({ kind }, context), null);
  const noRefs = wire(); noRefs.reference.entries[0].sourceRefs = [];
  assert.equal(decodeAddressRead(noRefs, context), null);
});

test("source transport failure differs from a successful empty/missing read", () => {
  const raw = wire();
  const missing = decodeAddressRead({ ...raw, reference: { kind: "missing" } }, context)!;
  assert.equal(missing.manual.kind, "missing"); assert.equal(missing.referencesUnavailable, false);
  const failure = decodeAddressRead({ ...raw, reference: { kind: "unavailable" } }, context)!;
  assert.equal(failure.referencesUnavailable, true); assert.equal(failure.manual.kind, "missing");
  assert.equal(decodeAddressRead({ ...raw, userProvided: undefined, reference: null }, context), null);
});

test("late response, route/actor change and unmount cannot publish into successor read", async () => {
  const controller = new AddressReadController();
  let resolve!: (value: unknown) => void;
  let oldSignal: AbortSignal | undefined;
  const published: string[] = [];
  const old = controller.load(context, (_, signal) => { oldSignal = signal; return new Promise(r => { resolve = r; }); }, state => published.push(`old:${state.kind}`));
  const next = { ...context, actorKey: "session-B" };
  await controller.load(next, async () => wire(), state => published.push(`new:${state.kind}`));
  resolve(wire()); await old;
  assert.equal(oldSignal?.aborted, true);
  assert.deepEqual(published, ["old:loading", "new:loading", "new:ready"]);
  assert.equal(sameAddressContext(context, next), false);
  let finish!: (value: unknown) => void;
  const gone = controller.load(context, () => new Promise(r => { finish = r; }), state => published.push(`gone:${state.kind}`));
  controller.invalidate(); finish(wire()); await gone;
  assert.equal(published.at(-1), "gone:loading");
  await controller.load(context, async () => { throw new Error("transport"); }, state => published.push(state.kind));
  assert.equal(published.at(-1), "unavailable");
});

test("prepare uses only original versioned patch, preserves bytes, and never confirms or retries unknown ACK", async () => {
  const text = " 上海 A座 \n";
  const calls: unknown[] = [];
  assert.equal(await prepareAddress(context, () => context, text, async request => { calls.push(request); }), "prepared");
  assert.deepEqual([...calls], [{ context, patch: { expectedVersion: 3, operations: [{ kind: "set_item_chinese_address", dayId: "day1", itemId: "item1", text }] } }]);
  assert.equal(await prepareAddress(context, () => ({ ...context, tripVersion: 4 }), text, async () => { throw Error("must not run"); }), "stale");
  await assert.rejects(prepareAddress(context, () => context, text, async request => { calls.push(request); throw Error("unknown ACK"); }), /unknown ACK/);
  assert.equal(calls.length, 2);
  assert.deepEqual(addressOperation(context, null), { kind: "set_item_chinese_address", dayId: "day1", itemId: "item1", text: null });
  for (const invalid of ["", "中".repeat(501), "😀".repeat(376), "中\ud800", "中\u0000"]) assert.throws(() => addressOperation(context, invalid));
});

test("online read binds exact item/version and preserves cookie GET/no-store/abort without model egress", async () => {
  const prior = globalThis.fetch;
  let request: { url: string; options?: RequestInit } | undefined;
  globalThis.fetch = (async (url: unknown, options?: RequestInit) => { request = { url: String(url), options }; return Response.json(wire()); }) as typeof fetch;
  try {
    const signal = new AbortController().signal;
    await readOnlineAddresses(context, signal);
    assert.equal(request?.url, `/api/trips/${context.tripId}/addresses?expectedTripVersion=3&dayId=day1&itemId=item1`);
    assert.deepEqual(request?.options, { cache: "no-store", credentials: "same-origin", signal, redirect: "error" });
  } finally { globalThis.fetch = prior; }
});


test("source display expires by 30s without polling and retains confirmed manual bytes independently", async t => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1800000000000 });
  const controller = new AddressReadController(), states: AddressState[] = [];
  const text = " 上海 A座 \n";
  const raw = { ...wire(), userProvided: { kind: "provided", address: { text, source: "user_provided", verification: "unverified" } } };
  let reads = 0;
  await controller.load(context, async () => { reads++; return raw; }, state => states.push(state));
  t.mock.timers.tick(29000);
  let last = states.at(-1)!;
  assert.equal(last.kind, "ready"); if (last.kind === "ready") assert.equal(last.value.references.length, 1);
  t.mock.timers.tick(1001);
  last = states.at(-1)!;
  assert.equal(last.kind, "ready");
  if (last.kind === "ready") {
    assert.equal(last.value.references.length, 0); assert.equal(last.value.referencesUnavailable, true);
    assert.deepEqual(last.value.manual, { kind: "provided", address: raw.userProvided.address });
  }
  t.mock.timers.tick(3600000); assert.equal(reads, 1);
  controller.invalidate();
});

test("earlier evidence expiry clears only references; explicit refresh and context invalidation retain their fences", async t => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1800000000000 });
  const controller = new AddressReadController(), states: AddressState[] = [], raw = wire();
  const expiry = new Date(Date.now() + 5000).toISOString();
  raw.reference.entries[0].expiresAt = expiry; raw.reference.entries[0].claim.evidence[0].expiresAt = expiry;
  let reads = 0;
  await controller.load(context, async () => { reads++; return raw; }, state => states.push(state));
  t.mock.timers.tick(5001);
  const expired = states.at(-1)!;
  assert.equal(expired.kind, "ready"); if (expired.kind === "ready") { assert.equal(expired.value.references.length, 0); assert.equal(expired.value.manual.kind, "missing"); }
  assert.equal(reads, 1);
  await controller.load(context, async () => { reads++; return wire(); }, state => states.push(state));
  const refreshed = states.at(-1)!;
  assert.equal(refreshed.kind, "ready"); if (refreshed.kind === "ready") assert.equal(refreshed.value.references.length, 1);
  const count = states.length;
  controller.invalidate(); t.mock.timers.tick(30001);
  assert.equal(states.length, count); assert.equal(reads, 2);
});
