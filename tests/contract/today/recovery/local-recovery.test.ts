import test from "node:test";
import assert from "node:assert/strict";
import { parseRecoveryHTTPInput, type RecoveryInput } from "../../../../lib/server/today/recovery/contract.ts";
import { localRecoveryCandidates, recoveryScope, type RecoveryContext } from "../../../../lib/server/today/recovery/preview.ts";
import { prepareLocalRecovery, submitLocalRecovery, readLocalRecoveryOperation, sameRecoveryValue } from "../../../../lib/server/today/recovery/service.ts";
import { applyPatch } from "../../../../lib/server/trip/patch/contract.ts";

const id = (n: number) => `${n}14b8576-e9e7-49aa-aa66-94eac6ba6544`;
const now = Date.parse("2026-10-04T04:00:00.000Z");
const input: RecoveryInput = { operationId: id(1), expectedHeadVersion: 2, dayId: "Day_UPPER-1", selectedItemIds: ["Optional_1", "Optional_2"], fixedItemIds: ["Dinner"],
  reservationBindings: [], report: { source: "user_report", kind: "fatigue", observedAt: new Date(now).toISOString() }, locale: "zh" };
const snapshot = { version: 2, title: "Owned Trip", days: [{ id: "Day_UPPER-1", date: "2026-10-04", timeZone: "Asia/Shanghai", items: [
  { id: "Optional_1", dayId: "Day_UPPER-1", title: "First optional" }, { id: "Optional_2", dayId: "Day_UPPER-1", title: "Second optional" },
  { id: "Dinner", dayId: "Day_UPPER-1", title: "Dinner", startsAt: "2026-10-04T10:00:00Z", endsAt: "2026-10-04T11:00:00Z" },
] }, { id: "OtherDay", date: "2026-10-05", items: [{ id: "Other", dayId: "OtherDay", title: "Unselected other day" }] }] };
const profile = { data: { displayName: "", travelPace: "relaxed" as const, locale: "zh" as const, currency: "CNY" as const, distanceUnit: "kilometre" as const,
  temperatureUnit: "celsius" as const, defaultDepartureTime: "09:00", updatedAt: new Date(now).toISOString() } };
const context: RecoveryContext = { kind: "local_recovery_context/1", contextId: id(2), contextDigest: "a".repeat(64), tripId: id(3), baseVersion: 2,
  expiresAt: new Date(now + 300000).toISOString(), profileBasis: { travelPace: "relaxed", updatedAt: profile.data.updatedAt }, reservationBasis: [], input };

test("two actual patches omit only explicit optional items and preserve dinner/other-day exact fields", () => {
  const before = structuredClone(snapshot);
  const r = localRecoveryCandidates(snapshot, input, { complete: true, reservations: [] }, profile, now, context);
  assert.equal(r.status, "candidates"); assert.equal(r.candidates.length, 2);
  for (const candidate of r.candidates as { patch: Parameters<typeof applyPatch>[1]; feasibility: { status: string } }[]) {
    const after = applyPatch(snapshot, candidate.patch);
    assert.deepEqual(after.days[0].items?.find(i => i.id === "Dinner"), snapshot.days[0].items[2]);
    assert.deepEqual(after.days[1], snapshot.days[1]); assert.equal(candidate.feasibility.status, "pending");
  }
  assert.deepEqual(snapshot, before); assert.equal(r.externalOutcome, "unknown");
});
test("context lawful saved pace orders options; absent consent cannot use legacy profile string", () => {
  const relaxed = localRecoveryCandidates(snapshot, input, { complete: true, reservations: [] }, profile, now, context);
  assert.equal((relaxed.candidates[0] as { candidateId: string }).candidateId, "omit_selected");
  const unset = localRecoveryCandidates(snapshot, input, { complete: true, reservations: [] }, profile, now, { ...context, profileBasis: { ...context.profileBasis, travelPace: null } });
  assert.equal(unset.preferenceContext.travelPace, null); assert.equal((unset.candidates[0] as { candidateId: string }).candidateId, "omit_one");
  const drift = localRecoveryCandidates(snapshot, input, { complete: true, reservations: [] }, { data: { ...profile.data, travelPace: "packed" } }, now, context);
  assert.equal(drift.status, "pending"); assert.equal(drift.reason, "STALE_CONTEXT");
});
test("unread scope, unknown/unbound orders and selected fixed scope never produce executable candidates", () => {
  assert.equal(recoveryScope(snapshot, input, { complete: false, reservations: [] }, now), "RESERVATION_SCOPE_UNAVAILABLE");
  const reference = { referenceId: id(4), revision: 1, contentDigest: "b".repeat(64), status: "reserved" as const, evidenceTier: "user_reported" as const };
  assert.equal(recoveryScope(snapshot, input, { complete: true, reservations: [reference] }, now), "FIXED_RESERVATION_UNBOUND");
  const bound = { ...input, reservationBindings: [{ referenceId: id(4), revision: 1, dayId: input.dayId, itemId: "Dinner" }] };
  assert.equal(recoveryScope(snapshot, bound, { complete: true, reservations: [reference] }, now), null);
  assert.equal(recoveryScope(snapshot, { ...bound, selectedItemIds: ["Dinner"] }, { complete: true, reservations: [reference] }, now), "FIXED_SCOPE_OVERLAP");
  assert.equal(recoveryScope(snapshot, bound, { complete: true, reservations: [{ ...reference, status: "unknown" }] }, now), "RESERVATION_STATUS_UNKNOWN");
});
test("future/expired report and high-risk unwell cannot generate omission or advice to continue", () => {
  for (const observedAt of [new Date(now + 1).toISOString(), new Date(now - 300000).toISOString()]) assert.equal(recoveryScope(snapshot, { ...input, report: { ...input.report, observedAt } }, { complete: true, reservations: [] }, now), "REPORT_RECHECK_REQUIRED");
  const r = localRecoveryCandidates(snapshot, { ...input, report: { ...input.report, kind: "high_risk_unwell" } }, { complete: true, reservations: [] }, profile, now, context);
  assert.equal(r.status, "pending"); assert.equal(r.candidates.length, 0); assert.equal(r.nextStep, "stop_and_seek_local_help");
  assert.equal(r.officialChannel.status, "unavailable");
});
test("closed wire rejects unselected mutation, synthetic provider authority, duplicates and future transport", () => {
  assert.ok(parseRecoveryHTTPInput({ operation: "preview", input }));
  assert.equal(parseRecoveryHTTPInput({ operation: "preview", input: { ...input, ownerId: id(3) } }), null);
  assert.equal(parseRecoveryHTTPInput({ operation: "preview", input: { ...input, selectedItemIds: ["Optional_1", "Optional_1"] } }), null);
  assert.equal(parseRecoveryHTTPInput({ operation: "preview", input: { ...input, report: { ...input.report, source: "provider_verified" } } }), null);
  assert.equal(parseRecoveryHTTPInput({ operation: "transport", expectedHeadVersion: 2, dayId: input.dayId, itemId: "Optional_1", receiptId: id(5), departure: "tomorrow" }), null);
});
test("context and selection receipts must echo the exact original IDs/body, and never accept refreshed expiry", async () => {
  const rpc = async () => ({ data: context, error: null });
  assert.deepEqual(await prepareLocalRecovery(id(3), input, rpc), context);
  await assert.rejects(prepareLocalRecovery(id(3), input, async () => ({ data: { ...context, input: { ...input, selectedItemIds: ["Dinner"] } }, error: null })), /RECOVERY_UNAVAILABLE/);
  const extended = localRecoveryCandidates(snapshot, input, { complete: true, reservations: [] }, profile, now, { ...context, expiresAt: new Date(now + 300001).toISOString() });
  assert.equal(extended.status, "pending");
  assert.ok(sameRecoveryValue({ x: 1, y: 2 }, { y: 2, x: 1 }));
});
test("lost ACK stays unknown; exact operation recovery cannot promote a forged applied version", async () => {
  const selection = { operationId: id(6), contextId: context.contextId, contextDigest: context.contextDigest, candidateId: "omit_one" as const };
  await assert.rejects(submitLocalRecovery(id(3), selection, async () => ({ data: null, error: { message: "connection lost" } })), /RECOVERY_RECEIPT_UNKNOWN/);
  const receipt = { kind: "local_recovery_proposal/1", ...selection, proposalId: id(7), proposalRevision: 1, baseVersion: 2, expiresAt: new Date(now + 30000).toISOString(), reused: true };
  const recovered = { kind: "local_recovery_operation/1", operationId: selection.operationId, tripId: id(3), input: selection, receipt, state: "applied", resultingVersion: 3 };
  assert.deepEqual(await readLocalRecoveryOperation(id(3), selection.operationId, async () => ({ data: recovered, error: null })), recovered);
  await assert.rejects(readLocalRecoveryOperation(id(3), selection.operationId, async () => ({ data: { ...recovered, resultingVersion: 4 }, error: null })), /RECOVERY_RECEIPT_UNKNOWN/);
  await assert.rejects(submitLocalRecovery(id(3), selection, async () => ({ data: { ...receipt, operationId: id(8) }, error: null })), /RECOVERY_RECEIPT_UNKNOWN/);
});
