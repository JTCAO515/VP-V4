import assert from "node:assert/strict";
import test from "node:test";
import { parsePlaceAction, type PlaceMutation } from "../../../lib/server/explore/place-action-contract.ts";
import { decodePlaceContext, type PlaceActionContext } from "../../../lib/server/explore/place-action-context.ts";
import { preparePlaceAdd } from "../../../lib/server/explore/place-action-preview.ts";
import { decodePlaceReceipt, decodePlaceCancelled, decodeSavedPlaceActions, runPlaceAction, type PlaceActionPorts, type PlaceActionReceipt } from "../../../lib/server/explore/place-action-service.ts";
import { matchesPlaceProposalReference, placeProposalReference } from "../../../lib/server/explore/proposal-review-reference.ts";
import { evaluatePlaceAdd } from "../../../lib/server/explore/place-action-evaluation.ts";
import { placeActionHTTP } from "../../../lib/server/explore/place-action-http.ts";
import { NextRequest } from "next/server.js";

const trip = "12345678-1234-4234-8234-123456789abc", poi = "22345678-1234-4234-8234-123456789abc", op = "32345678-1234-4234-8234-123456789abc", ref = "42345678-1234-4234-8234-123456789abc", proposalId = "52345678-1234-4234-8234-123456789abc";
const hash = "a".repeat(64), selected = { canonicalPoiId: poi, provider: "amap" as const, providerPoiId: "poi-exact" };
const command = (): Extract<PlaceMutation, { action: "add" }> => ({ action: "add", operationId: op, expectedTripVersion: 2, selection: selected, expectedMappingDigest: hash,
  dayId: "day_1", itemId: "place_new", startsAt: "2026-10-05T10:00:00Z", endsAt: "2026-10-05T11:00:00Z", locale: "en" });
const context = (): PlaceActionContext => ({ kind: "place_action_context", tripId: trip, tripVersion: 2, selection: selected, mappingDigest: hash, contextDigest: hash,
  snapshot: { version: 2, title: "Own Trip", days: [{ id: "day_1", date: "2026-10-05", timeZone: "Asia/Shanghai", items: [
    { id: "before", dayId: "day_1", title: "Before", startsAt: "2026-10-05T09:00:00Z", endsAt: "2026-10-05T09:30:00Z" },
    { id: "after", dayId: "day_1", title: "After", startsAt: "2026-10-05T12:00:00Z", endsAt: "2026-10-05T13:00:00Z" }] }] },
  displayTitle: "Canonical name", referenceId: null, saved: null, sourceCandidates: [], sourceCandidatesStatus: "complete", evaluatedAt: new Date(Date.now() - 10).toISOString(), expiresAt: new Date(Date.now() + 29000).toISOString() });
const receipt = (request: PlaceMutation): PlaceActionReceipt => ({ kind: "place_action_receipt", tripId: trip, operationId: request.operationId, action: request.action, selection: request.selection,
  tripVersion: request.expectedTripVersion, mappingDigest: request.expectedMappingDigest, requestDigest: hash, referenceId: ref, savedRevision: request.action === "add" ? null : request.expectedSaveRevision + 1,
  savedStatus: request.action === "add" ? null : request.action === "save" ? "saved" : "unsaved", proposal: request.action === "add" ? { proposalId, revision: 1, baseTripVersion: 2 } : null,
  historicalOnly: true, currentEligibilityRequiresRead: true });
function harness(overrides: Partial<PlaceActionPorts> = {}) {
  const calls: string[] = []; let stored: PlaceActionReceipt | null = null;
  const ports: PlaceActionPorts = { current: async () => true, enabled: () => true, now: Date.now,
    rpc: async (name, params) => { calls.push(name + ":" + (params.p_input as Record<string, unknown>).action);
      if (name === "read_place_action_context_v1") return { data: context(), error: null };
      const input = params.p_input as Record<string, unknown>;
      if (input.action === "receipt") return { data: stored ?? { kind: "receipt_absent", tripId: trip, operationId: op }, error: null };
      stored = receipt(input as PlaceMutation); return { data: stored, error: null }; },
    proposal: async () => ({ id: proposalId, revision: 1, digest: "trip-v2:" + hash, baseVersion: 2, after: preparePlaceAdd(context(), command())!.after }),
    evaluate: async () => ({ kind: "evaluated" }), ...overrides };
  return { calls, ports, store: (r: PlaceActionReceipt) => { stored = r; } };
}

test("RL-03 closed inputs reject actor, title, knowledge, coordinates, route claims and impossible dates", () => {
  assert.deepEqual(parsePlaceAction(command()), command());
  for (const extra of ["actor", "title", "source", "route", "location", "consent", "plan"]) assert.equal(parsePlaceAction({ ...command(), [extra]: "caller claim" }), null);
  for (const start of ["2026-02-30T10:00:00Z", "2026-10-05T24:00:00Z", "2026-10-05T10:00:60Z", "2026-10-05T10:00:00+14:01", "0000-10-05T10:00:00Z"]) assert.equal(parsePlaceAction({ ...command(), startsAt: start }), null);
  for (const providerPoiId of ["x\u0000", "\ud800", " x", "x ", "😀".repeat(65)]) assert.equal(parsePlaceAction({ ...command(), selection: { ...selected, providerPoiId } }), null);
  assert.equal(parsePlaceAction({ ...command(), expectedTripVersion: 1.5 }), null);
  assert.equal(parsePlaceAction({ ...command(), operationId: op.toUpperCase() }), null);
  assert.equal(parsePlaceAction({ action: "receipt", request: { action: "receipt", request: command() } }), null);
});
test("RL-02 context rejects stale clock, wrong entity/Trip, reader incompleteness masquerading as evidence and oversized snapshots", () => {
  const input = { expectedTripVersion: 2, selection: selected, locale: "en" as const };
  assert.ok(decodePlaceContext(context(), trip, input));
  for (const change of [{ tripId: poi }, { selection: { ...selected, canonicalPoiId: trip } }, { expiresAt: new Date(Date.now() - 1).toISOString() },
    { evaluatedAt: new Date(Date.now() + 1000).toISOString() }, { sourceCandidatesStatus: "complete_guess" }, { extra: "provider payload" }]) assert.equal(decodePlaceContext({ ...context(), ...change }, trip, input), null);
});
test("RL-04 missing opening, reservation, stay source and future route retain pending; only affected directed edges are selected", () => {
  const prepared = preparePlaceAdd(context(), command())!;
  assert.equal(prepared.preview.status, "pending");
  assert.deepEqual(prepared.preview.affectedDirectedEdges.map(e => [e.fromItemId, e.toItemId]), [["before", "place_new"], ["place_new", "after"]]);
  assert.deepEqual(prepared.preview.removedDirectedEdges.map(e => [e.fromItemId, e.toItemId]), [["before", "after"]]);
  assert.equal(prepared.preview.matrix.providerCalls, 0); assert.equal(prepared.preview.matrix.cost, "unknown");
  assert.ok(prepared.preview.lines.some(l => l.constraint === "opening" && l.status === "pending"));
  assert.equal(context().snapshot.days[0].items?.length, 2);
  assert.equal(preparePlaceAdd(context(), { ...command(), itemId: "before" }), null);
  assert.equal(preparePlaceAdd(context(), { ...command(), dayId: "other" }), null);
});
test("RL-01 explicit Add creates one original pending Proposal and preserves the trip-v2 review digest", async () => {
  const h = harness(), result = await runPlaceAction(trip, command(), h.ports) as Record<string, unknown>;
  assert.equal(result.kind, "place_action_receipt"); assert.deepEqual(result.proposalReview, { id: proposalId, revision: 1, digest: "trip-v2:" + hash, baseVersion: 2 });
  assert.deepEqual(h.calls.filter(c => c.endsWith(":add")), ["execute_place_action_v1:add"]);
  assert.equal((result.preview as Record<string, unknown>).status, "pending");
  await runPlaceAction(trip, command(), h.ports);
  assert.equal(h.calls.filter(c => c.endsWith(":add")).length, 1);
});
test("lost ACK readback reuses exact operation without new Proposal, including rollback disabled or stale mapping", async () => {
  const h = harness({ enabled: () => false }); h.store(receipt(command()));
  const result = await runPlaceAction(trip, { action: "receipt", request: command() }, h.ports) as Record<string, unknown>;
  assert.equal(result.historicalOnly, true); assert.equal(result.currentEligibilityRequiresRead, true); assert.equal(result.preview, null);
  assert.deepEqual(h.calls, ["execute_place_action_v1:receipt"]);
  await runPlaceAction(trip, command(), h.ports); assert.equal(h.calls.some(c => c.endsWith(":add")), false);
});
test("source or mapping churn rejects before dispatch, and session loss never starts a write", async () => {
  let reads = 0; const h = harness({ rpc: async name => name === "read_place_action_context_v1" ? { data: { ...context(), contextDigest: (++reads === 1 ? "a" : "b").repeat(64) }, error: null }
    : { data: { kind: "receipt_absent", tripId: trip, operationId: op }, error: null } });
  await assert.rejects(runPlaceAction(trip, command(), h.ports), /MAPPING_CHANGED/);
  const denied = harness({ current: async () => false }); await assert.rejects(runPlaceAction(trip, command(), denied.ports), /UNAUTHENTICATED/); assert.equal(denied.calls.length, 0);
});
test("Unsave remains executable with mapping withdrawn and feature off; it does not read current place/source", async () => {
  const request: PlaceMutation = { action: "unsave", operationId: op, expectedTripVersion: 2, selection: selected, expectedMappingDigest: hash, referenceId: ref, expectedSaveRevision: 7 };
  const h = harness({ enabled: () => false, proposal: async () => null });
  const result = await runPlaceAction(trip, request, h.ports) as PlaceActionReceipt;
  assert.equal(result.savedStatus, "unsaved"); assert.equal(result.savedRevision, 8); assert.equal(h.calls.some(c => c.startsWith("read_place")), false);
});
test("receipt decoder rejects changed operation/identity/revision/CAS and fake current eligibility", () => {
  const r = receipt(command()); assert.ok(decodePlaceReceipt(r, trip, command()));
  for (const change of [{ operationId: poi }, { tripId: poi }, { tripVersion: 3 }, { mappingDigest: "b".repeat(64) }, { historicalOnly: false }, { currentEligibilityRequiresRead: false },
    { proposal: { proposalId, revision: 1, baseTripVersion: 3 } }, { actor: "other" }]) assert.equal(decodePlaceReceipt({ ...r, ...change }, trip, command()), null);
});
test("Ask is an exact first-party current-input/Trip reference and cannot dispatch a provider or promote knowledge", async () => {
  const h = harness(); const result = await runPlaceAction(trip, { action: "ask", expectedTripVersion: 2, selection: selected, expectedMappingDigest: hash, locale: "en" }, h.ports) as Record<string, unknown>;
  assert.equal(result.kind, "place_ask_context"); assert.equal(result.readyForProvider, false); assert.equal(result.handoff, null); assert.deepEqual(result.currentInput, selected);
  assert.deepEqual(result.selectedSources, { artifact: null, trip: { tripId: trip, headVersion: 2 }, evidence: [] }); assert.equal(h.calls.some(c => c.startsWith("execute")), false);
});
test("Native/Web route credential and origin crossover is rejected before any outbound request", async () => {
  const old = globalThis.fetch; let calls = 0; globalThis.fetch = async () => { calls++; throw Error("No outbound"); };
  try {
    for (const headers of [{ cookie: "session=x" }, { origin: "http://localhost" }] as Record<string,string>[]) assert.equal((await placeActionHTTP(new NextRequest("http://localhost/action", { method: "POST", headers, body: JSON.stringify(command()) }), trip, true)).status, 400);
    for (const headers of [{ authorization: "Bearer x", origin: "http://localhost" }, { origin: "https://evil.test" }] as Record<string,string>[]) assert.equal((await placeActionHTTP(new NextRequest("http://localhost/action", { method: "POST", headers, body: JSON.stringify(command()) }), trip, false)).status, 400);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = old; }
});
test("durable abandon returns exact cancellation terminal; original execute stays fenced with no new write", async () => {
  const cancelled = { kind: "place_action_cancelled", tripId: trip, operationId: op, action: "add", selection: selected, tripVersion: 2, mappingDigest: hash, requestDigest: hash, historicalOnly: true, currentEligibilityRequiresRead: true };
  let fenced = false, writes = 0;
  const h = harness({ rpc: async (_name, params) => {
    const input = params.p_input as Record<string, unknown>;
    if (input.action === "abandon") { fenced = true; return { data: cancelled, error: null }; }
    if (fenced) return { data: cancelled, error: null };
    writes++; return { data: null, error: { message: "Unexpected write" } };
  } });
  assert.deepEqual(await runPlaceAction(trip, { action: "abandon", request: command() }, h.ports), cancelled);
  assert.deepEqual(await runPlaceAction(trip, command(), h.ports), cancelled); assert.equal(writes, 0);
  assert.equal(decodePlaceCancelled({ ...cancelled, mappingDigest: "b".repeat(64) }, trip, command()), null);
  assert.equal(decodePlaceCancelled({ ...cancelled, tripVersion: 3 }, trip, command()), null);
  const won = harness(); won.store(receipt(command()));
  // SQL's real concurrent single winner is tested in the disposable PostgreSQL suite.
  const value = await runPlaceAction(trip, { action: "abandon", request: command() }, { ...won.ports, rpc: async () => ({ data: receipt(command()), error: null }) }) as Record<string, unknown>;
  assert.equal(value.kind, "place_action_receipt");
});
test("saved reentry retains withdrawn original identity; pagination drift, false completeness and duplicate references fail closed", () => {
  const row = { referenceId: ref, revision: 1, status: "saved", selection: selected, mappingDigest: hash, displayTitle: null, mappingStatus: "unavailable" };
  const page = { kind: "saved_place_actions", tripId: trip, tripVersion: 2, contextDigest: hash, items: [row], hasMore: false, nextCursor: null };
  assert.ok(decodeSavedPlaceActions(page, trip, 2)); assert.equal(decodeSavedPlaceActions({ ...page, complete: true }, trip, 2), null);
  assert.equal(decodeSavedPlaceActions({ ...page, hasMore: true }, trip, 2), null);
  assert.equal(decodeSavedPlaceActions({ ...page, items: [row, row] }, trip, 2), null);
  assert.equal(decodeSavedPlaceActions(page, trip, 2, 20, { contextDigest: "b".repeat(64), afterCanonicalPoiId: trip }), null);
  assert.equal(decodeSavedPlaceActions(page, trip, 2, 20, { contextDigest: hash, afterCanonicalPoiId: poi }), null);
});
test("exact Proposal review rejects latest fallback, changed revision/digest/base/Trip and missing stale proof", () => {
  const reference = placeProposalReference({ id: proposalId, revision: 1, digest: "trip-v2:" + hash, baseVersion: 2 })!;
  const value = { trip: { id: trip }, proposal: { id: proposalId, revision: 1, digest: reference.digest, baseTripVersion: 2, stale: false } };
  assert.equal(matchesPlaceProposalReference(reference, value, trip), true);
  for (const patch of [{ id: poi }, { revision: 2 }, { digest: "trip-v2:" + "b".repeat(64) }, { baseTripVersion: 3 }, { stale: true }, { stale: undefined }])
    assert.equal(matchesPlaceProposalReference(reference, { ...value, proposal: { ...value.proposal, ...patch } }, trip), false);
  assert.equal(matchesPlaceProposalReference(reference, { ...value, trip: { id: poi } }, trip), false);
  assert.equal(placeProposalReference({ ...reference, digest: hash }), null);
});
test("existing #219 evaluator consumes bounded affected edges and explicit needs; missing or future route does not call a provider", async () => {
  const c = context(), input = command(), h = harness(), after = preparePlaceAdd(c, input)!.after;
  const needs = { partySize: 1, currency: "CNY", maxBudgetMinor: 100, minTransferMinutes: 10, baggageBufferMinutes: 5, appointmentBufferMinutes: 5, maxWalkingMinutes: 20 };
  let outbound = 0;
  const ports = { rpc: async () => ({ data: { kind: "unavailable" }, error: null }), current: async () => true, quota: async () => true, env: {}, signal: new AbortController().signal,
    fetcher: (async () => { outbound++; throw Error("No provider"); }) as typeof fetch };
  const proposal = (await h.ports.proposal(proposalId))!;
  const result = await evaluatePlaceAdd(c, input, { ...proposal, after }, { needs, placeChoices: [], routeRequests: [{ fromItemId: "before", toItemId: "place_new", mode: "walking", departure: "now", mapConsent: true }] }, ports);
  assert.equal(result.status, "pending"); assert.equal(outbound, 0); assert.equal(result.matrix.affectedElements, 2); assert.equal(result.matrix.requestedElements, 1);
  assert.ok(result.lines.some(l => l.reason === "PRICE_EVIDENCE_REQUIRED")); assert.ok(result.lines.some(l => l.reason === "USER_WINDOW_NOT_SOURCED_STAY_DURATION"));
  await assert.rejects(evaluatePlaceAdd(c, input, proposal, { needs, placeChoices: [], routeRequests: [{ fromItemId: "after", toItemId: "before", mode: "walking", departure: "now", mapConsent: true }] }, ports), /INVALID_INPUT/);
});
