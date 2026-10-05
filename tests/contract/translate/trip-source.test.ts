import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server.js";
import { parseTripTranslationReference, projectTripTranslationSource, selectedTripTranslationText } from "../../../lib/server/media-translation/text/trip-source.ts";
import { translationHTTP } from "../../../lib/server/media-translation/text/http.ts";
import { readTranslationInput } from "../../../lib/server/media-translation/text/contract.ts";
import { tripTranslationSourceHTTP, type TripSourceAdapterFactory } from "../../../lib/server/media-translation/text/trip-source-http.ts";
const ownerId = "11111111-1111-4111-8111-111111111111", tripId = "22222222-2222-4222-8222-222222222222";
const detail = { trip: { id: tripId, headVersion: 3, title: "My trip" }, confirmationState: "confirmed", content: { days: [
  { id: "Day-1", date: "2026-10-05", items: [{ id: "item_A", dayId: "Day-1", title: "Not airport terminal 2" }] },
] }, memory: "UNSELECTED PRIVATE MEMORY", pendingProposal: "UNCONFIRMED" };
const ref = { ownerId, tripId, headVersion: 3, dayId: "Day-1", itemId: "item_A", field: "title" as const };
const submission = { threadId: ownerId, turnId: ownerId, policyId: ownerId, idempotencyKey: ownerId, sourceLocale: "en", targetLocale: "zh", text: "Not airport terminal 2", tripSource: ref };
const post = (body: unknown) => new NextRequest("http://127.0.0.1/api/translate", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer synthetic" }, body: JSON.stringify(body) });
const source = projectTripTranslationSource(ownerId, detail)!;

test("confirmed canonical fields retain opaque IDs and exclude Memory and inferred addresses", () => {
  assert.deepEqual(source.fields, [
    { dayId: null, itemId: null, field: "title", value: "My trip" },
    { dayId: "Day-1", itemId: null, field: "date", value: "2026-10-05" },
    { dayId: "Day-1", itemId: "item_A", field: "title", value: "Not airport terminal 2" },
  ]);
  assert.equal(JSON.stringify(source).includes("PRIVATE"), false);
  assert.equal(selectedTripTranslationText(source, ref), submission.text);
  for (const confirmationState of ["initial", "unknown", "pending"]) assert.equal(projectTripTranslationSource(ownerId, { ...detail, confirmationState }), null);
  assert.equal(projectTripTranslationSource(ownerId, { ...detail, trip: { ...detail.trip, headVersion: 0 } }), null);
  assert.equal(projectTripTranslationSource(ownerId, { ...detail, content: { days: [{ ...detail.content.days[0], items: [{ ...detail.content.days[0].items[0], dayId: "another_day" }] }] } }), null);
});
test("reference closes field scope, authority, IDs and extra context", () => {
  assert.deepEqual(parseTripTranslationReference(ref), ref);
  for (const bad of [{ ...ref, field: "address" }, { ...ref, memory: "private" }, { ...ref, ownerId: "other" },
    { ...ref, headVersion: 0 }, { ...ref, dayId: "invalid/id" }, { ...ref, itemId: null }, { ...ref, field: "date" }]) assert.equal(parseTripTranslationReference(bad), null);
  for (const drift of [{ ...ref, ownerId: tripId }, { ...ref, tripId: ownerId }, { ...ref, headVersion: 4 }, { ...ref, itemId: "another" }]) assert.equal(selectedTripTranslationText(source, drift), null);
});
test("selected exact bytes enter unchanged current-input lane with no source metadata", async () => {
  let calls = 0;
  const result = await translationHTTP(post(submission), async (request, action) => {
    calls++; assert.equal(action, "submit");
    const body = await request.json();
    assert.deepEqual(readTranslationInput(body.text), { sourceLocale: "en", targetLocale: "zh", text: submission.text });
    assert.deepEqual(Object.keys(body).sort(), ["threadId", "turnId", "idempotencyKey", "policyId", "locale", "text"].sort());
    assert.equal(body.idempotencyKey, ownerId); assert.equal(body.policyId, ownerId);
    assert.equal(body.text.includes("My trip"), false); assert.equal(body.text.includes(tripId), false);
    return Response.json({ kind: "accepted" }, { status: 201 });
  }, async (_, requested) => { assert.equal(requested, tripId); return Response.json(source); });
  assert.equal(result.status, 201); assert.equal(calls, 1);
});
test("drift, unselected text and owner loss fail before text admission", async () => {
  let calls = 0;
  const text: Parameters<typeof translationHTTP>[1] = async () => { calls++; throw Error("forbidden admission"); };
  for (const body of [{ ...submission, text: "changed" }, { ...submission, tripSource: { ...ref, headVersion: 2 } }, { ...submission, tripSource: { ...ref, dayId: "another_day" } }])
    assert.equal((await translationHTTP(post(body), text, async () => Response.json(source))).status, 409);
  assert.equal((await translationHTTP(post({ ...submission, tripSource: { ...ref, ownerId: tripId } }), text, async () => Response.json(source))).status, 403);
  for (const status of [401, 403, 503]) assert.equal((await translationHTTP(post(submission), text, async () => Response.json({ error: { code: "UNAVAILABLE" } }, { status }))).status, status);
  assert.equal(calls, 0);
});
test("source GET reuses owner session and confirmed Trip authority with no mutation", async () => {
  let gates = 0, reads = 0;
  const factory: TripSourceAdapterFactory = async () => ({
    authenticated: async () => { gates++; return { data: ownerId }; },
    getTrip: async (id: string) => { reads++; assert.equal(id, tripId); return { data: detail }; },
  } as unknown as NonNullable<Awaited<ReturnType<TripSourceAdapterFactory>>>);
  const result = await tripTranslationSourceHTTP(new NextRequest(`http://127.0.0.1/api/translate/trip-sources/${tripId}`), tripId, factory);
  assert.equal(result.status, 200); assert.equal(result.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await result.json(), source); assert.equal(gates, 2); assert.equal(reads, 1);
});
test("source GET blocks lost session, foreign Trip and unconfirmed snapshot", async () => {
  const request = () => new NextRequest(`http://127.0.0.1/api/translate/trip-sources/${tripId}`);
  const factory = (overrides: object): TripSourceAdapterFactory => async () => ({ authenticated: async () => ({ data: ownerId }), getTrip: async () => ({ data: detail }), ...overrides } as unknown as NonNullable<Awaited<ReturnType<TripSourceAdapterFactory>>>);
  assert.equal((await tripTranslationSourceHTTP(request(), tripId, factory({ authenticated: async () => ({ error: "UNAUTHENTICATED" }) }))).status, 401);
  assert.equal((await tripTranslationSourceHTTP(request(), tripId, factory({ getTrip: async () => ({ error: "FORBIDDEN" }) }))).status, 403);
  assert.equal((await tripTranslationSourceHTTP(request(), tripId, factory({ getTrip: async () => ({ data: { ...detail, confirmationState: "unknown" } }) }))).status, 409);
  let gates = 0;
  assert.equal((await tripTranslationSourceHTTP(request(), tripId, factory({ authenticated: async () => ++gates === 1 ? { data: ownerId } : { error: "UNAUTHENTICATED" } }))).status, 401);
});
test("recent Trip list offers bounded candidates, exact confirmed authority stays in detail", async () => {
  const factory: TripSourceAdapterFactory = async () => ({ authenticated: async () => ({ data: ownerId }), listTrips: async (limit: number) => {
    assert.equal(limit, 20); return { data: [{ id: ownerId, title: "Initial", headVersion: 0 }, { id: tripId, title: "My trip", headVersion: 3 }] };
  } } as unknown as NonNullable<Awaited<ReturnType<TripSourceAdapterFactory>>>);
  const result = await tripTranslationSourceHTTP(new NextRequest("http://127.0.0.1/api/translate/trip-sources"), undefined, factory);
  assert.deepEqual(await result.json(), { version: 1, kind: "trip_sources", ownerId, currentTripId: tripId, trips: [{ tripId, title: "My trip", headVersion: 3 }] });
});
test("ambient authority and malformed reference cannot read or admit", async () => {
  const factory: TripSourceAdapterFactory = async () => { throw Error("must not read"); };
  for (const suffix of ["?owner=other", "?tripId=other"]) assert.equal((await tripTranslationSourceHTTP(new NextRequest(`http://127.0.0.1/api/translate/trip-sources${suffix}`), undefined, factory)).status, 400);
  for (const headers of [new Headers({ Cookie: "" }), new Headers({ Origin: "http://127.0.0.1" })]) assert.equal((await tripTranslationSourceHTTP(new NextRequest("http://127.0.0.1/api/translate/trip-sources", { headers }), undefined, factory)).status, 400);
  assert.equal((await translationHTTP(post({ ...submission, tripSource: { ...ref, field: "address" } }), async () => { throw Error("must not admit"); })).status, 400);
});
