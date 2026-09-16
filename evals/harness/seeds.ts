import { isDeepStrictEqual } from "node:util";
import type { GroundedClaim } from "../../lib/server/contracts/index.ts";
import { prepareGroundedExecution } from "../../lib/server/knowledge/claim/grounded-execution.ts";
import { applyPatch, type TripPatch, type TripSnapshot } from "../../lib/server/trip/patch/contract.ts";
import { describeProposalDiff, type ProposalDiff } from "../../lib/server/trip/proposal/diff.ts";
import { NOW } from "./cases.ts";

export type Assertion = { step: string; code: string; passed: boolean };
export type SeedResult = { execution: "completed" | "waiting_confirmation"; outcome: "answered" | "blocked"; assertions: Assertion[]; verdict: "PASS" | "FAIL" };
const check = (step: string, code: string, passed: boolean): Assertion => ({ step, code, passed });
const result = (assertions: Assertion[], outcome: SeedResult["outcome"] = "answered"): SeedResult => ({ execution: "completed", outcome, assertions, verdict: assertions.every((item) => item.passed) ? "PASS" : "FAIL" });

// Independent oracle: the receipt envelope alone does not prove entailment.
const addressOracle = { lines: ["1 Synthetic Museum Road"], countryCode: "CN" };
export function runReadOnlySeed(mutation: "none" | "unsupported_claim" | "blanket_refusal" = "none"): SeedResult {
  const trips: TripSnapshot[] = [];
  const before = structuredClone(trips);
  const claim: GroundedClaim = { claimType: "address", subjectId: "synthetic-museum", value: { lines: [mutation === "unsupported_claim" ? "99 Invented Road" : "1 Synthetic Museum Road"], countryCode: "CN" }, asOf: NOW, evidence: [{ kind: "fact", factId: "fact-address", version: 1, reviewedAt: "2026-09-08T00:00:00.000Z", expiresAt: "2026-09-10T00:00:00.000Z" }] };
  const output = prepareGroundedExecution({ mode: "grounded_execution", now: NOW, cardId: "harness-readonly", claims: mutation === "blanket_refusal" ? [] : [{ claim, qualifiers: [] }] });
  const claims = output.kind === "execution_card" ? output.card.claims : [];
  return result([
    check("answer", "REQUIRED_CLAIM_PRESENT", claims.length === 1),
    check("grounding", "CLAIM_SUPPORTED_BY_ORACLE", claims.length === 1 && claims.every((value) => value.claimType === "address" && value.subjectId === "synthetic-museum" && isDeepStrictEqual(value.value, addressOracle))),
    check("grounding", "CURRENT_EVIDENCE_RECEIPT", output.kind === "execution_card" && output.card.evidence.length === 1 && isDeepStrictEqual(output.card.evidence[0], claim.evidence[0])),
    check("read_only", "TRIP_COLLECTION_UNCHANGED", isDeepStrictEqual(before, trips)),
  ], output.kind === "execution_card" ? "answered" : "blocked");
}

// H04 (VPJ-67, development): two distinct synthetic galleries share the same
// query with no city/gallery selected. The real seam is the same
// prepareGroundedExecution: a caller that cannot pick one eligible subject
// must submit an empty claims array rather than guessing, and the pure
// function's own NO_ELIGIBLE_EVIDENCE outcome is the clarification signal.
// This does not invent a new disambiguation adapter; it only exercises the
// existing function's real "no eligible claim" branch honestly.
const galleryCandidates = ["synthetic-gallery-north", "synthetic-gallery-south"] as const;
export function runAmbiguitySeed(mutation: "none" | "single_candidate_assumed" = "none"): SeedResult {
  const trips: TripSnapshot[] = [];
  const before = structuredClone(trips);
  const assumedClaim: GroundedClaim = { claimType: "time_window", subjectId: galleryCandidates[0], value: { startsAt: "2026-09-12T09:00:00+08:00", endsAt: "2026-09-12T17:00:00+08:00", timeZone: "Asia/Shanghai" }, asOf: NOW, evidence: [{ kind: "fact", factId: "fact-gallery-hours-north", version: 1, reviewedAt: "2026-09-08T00:00:00.000Z", expiresAt: "2026-09-20T00:00:00.000Z" }] };
  const output = prepareGroundedExecution({ mode: "grounded_execution", now: NOW, cardId: "harness-ambiguity", claims: mutation === "single_candidate_assumed" ? [{ claim: assumedClaim, qualifiers: [] }] : [] });
  return result([
    check("disambiguation", "MULTIPLE_ELIGIBLE_SUBJECTS", galleryCandidates.length === 2),
    check("answer", "NO_SINGLE_SUBJECT_SELECTED", output.kind === "unsupported_execution" && output.reason === "NO_ELIGIBLE_EVIDENCE"),
    check("read_only", "TRIP_COLLECTION_UNCHANGED", isDeepStrictEqual(before, trips)),
  ], output.kind === "unsupported_execution" ? "blocked" : "answered");
}

const dinner = { id: "dinner", dayId: "day-two", title: "Confirmed synthetic dinner", startsAt: "2026-09-11T18:00:00+08:00", endsAt: "2026-09-11T20:00:00+08:00" };
// Sidecar fields are synthetic: the accepted TripPatch contract has no place/status/receipt fields.
const sidecar = { placeId: "synthetic-restaurant", confirmationStatus: "confirmed", receiptId: "fixture-dinner-receipt-v1" };
const original: TripSnapshot = { version: 7, title: "Synthetic two-day trip", days: [
  { id: "day-one", date: "2026-09-10", timeZone: "Asia/Shanghai", items: [{ id: "arrival", dayId: "day-one", title: "Arrival" }] },
  { id: "day-two", date: "2026-09-11", timeZone: "Asia/Shanghai", items: [{ id: "afternoon", dayId: "day-two", title: "Synthetic museum via long walk", startsAt: "2026-09-11T14:00:00+08:00", endsAt: "2026-09-11T16:00:00+08:00" }, dinner] },
] };
// Independent expected state: never derived from applyPatch or the produced candidate.
const expectedFinal: TripSnapshot = { version: 8, title: "Synthetic two-day trip", days: [
  { id: "day-one", date: "2026-09-10", timeZone: "Asia/Shanghai", items: [{ id: "arrival", dayId: "day-one", title: "Arrival" }] },
  { id: "day-two", date: "2026-09-11", timeZone: "Asia/Shanghai", items: [
    { id: "afternoon", dayId: "day-two", title: "Synthetic museum via short walk", startsAt: "2026-09-11T14:00:00+08:00", endsAt: "2026-09-11T16:00:00+08:00" },
    { id: "dinner", dayId: "day-two", title: "Confirmed synthetic dinner", startsAt: "2026-09-11T18:00:00+08:00", endsAt: "2026-09-11T20:00:00+08:00" },
  ] },
] };
const routeBasis = { date: "2026-09-11", timeZone: "Asia/Shanghai", mode: "walk", source: "synthetic-route-table-v1", metric: "walkingMinutes" };
const routes = { before: { ...routeBasis, walkingMinutes: 40, walkingMeters: 2800 }, after: { ...routeBasis, walkingMinutes: 15, walkingMeters: 1000 } };
const expectedDinner = { ...dinner, date: "2026-09-11", timeZone: "Asia/Shanghai", ...sidecar };
function lock(snapshot: TripSnapshot, details = sidecar) {
  const day = snapshot.days.find((value) => value.id === "day-two");
  const item = day?.items?.find((value) => value.id === "dinner");
  return item ? { ...item, date: day?.date, timeZone: day?.timeZone, ...details } : null;
}
export type TripTrace = { candidate: TripSnapshot; diff: ProposalDiff; final: TripSnapshot; beforeConfirmation: TripSnapshot; rejected: TripSnapshot; reloaded: TripSnapshot; candidateSidecar: typeof sidecar; finalSidecar: typeof sidecar; confirmedRevision: string; confirmedBase: number; routeAfter: typeof routes.after };

export function gradeTripTrace(trace: TripTrace): SeedResult {
  const assertions = [
    check("scope", "INDEPENDENT_EXPECTED_STATE", [trace.candidate, trace.diff.next, trace.final, trace.reloaded].every((snapshot) => isDeepStrictEqual(snapshot, expectedFinal))),
    check("candidate", "DINNER_LOCK_PRESERVED", isDeepStrictEqual(lock(trace.candidate, trace.candidateSidecar), expectedDinner)),
    check("diff", "DINNER_LOCK_PRESERVED", isDeepStrictEqual(lock(trace.diff.next, trace.candidateSidecar), expectedDinner) && !trace.diff.dayDiffs.some((day) => day.items.some((item) => item.itemId === "dinner"))),
    check("confirmation", "NO_UNCONFIRMED_WRITE", isDeepStrictEqual(trace.beforeConfirmation, original)),
    check("rejection", "NO_REJECTED_WRITE", isDeepStrictEqual(trace.rejected, original)),
    check("confirmation", "EXACT_REVISION_BOUND", trace.confirmedRevision === "fixture-proposal-r1" && trace.confirmedBase === original.version),
    check("final", "DINNER_LOCK_PRESERVED", isDeepStrictEqual(lock(trace.final, trace.finalSidecar), expectedDinner)),
    check("final", "ONLY_REQUESTED_SCOPE_CHANGED", isDeepStrictEqual(trace.final.days[0], original.days[0]) && trace.final.title === original.title && trace.diff.dayDiffs.length === 1 && trace.diff.dayDiffs[0].dayId === "day-two" && trace.diff.dayDiffs[0].items.length === 1 && trace.diff.dayDiffs[0].items[0].itemId === "afternoon" && trace.diff.dayDiffs[0].items[0].kind === "changed"),
    check("route", "COMPARABLE_WALKING_REDUCTION", Object.entries(routeBasis).every(([key, value]) => Reflect.get(trace.routeAfter, key) === value) && trace.routeAfter.walkingMinutes < routes.before.walkingMinutes && trace.routeAfter.walkingMinutes >= 0),
    check("final", "REQUIRED_ITEMS_RETAINED", ["afternoon", "dinner"].every((id) => trace.final.days.find((day) => day.id === "day-two")?.items?.some((item) => item.id === id))),
    check("reload", "EXPECTED_VERSION_AND_STATE", trace.final.version === 8 && isDeepStrictEqual(trace.final, trace.candidate) && isDeepStrictEqual(trace.reloaded, trace.final)),
  ];
  return result(assertions);
}

export function tripSeedTrace(mutation: "none" | "dinner_changed" | "unconfirmed_write" = "none"): TripTrace {
  const patch: TripPatch = { expectedVersion: 7, operations: [
    { kind: "upsert_item", itemId: "afternoon", dayId: "day-two", title: "Synthetic museum via short walk", startsAt: "2026-09-11T14:00:00+08:00", endsAt: "2026-09-11T16:00:00+08:00" },
    ...(mutation === "dinner_changed" ? [{ kind: "upsert_item" as const, itemId: "dinner", dayId: "day-two", title: dinner.title, startsAt: "2026-09-11T19:00:00+08:00", endsAt: dinner.endsAt }] : []),
  ] };
  const candidate = applyPatch(original, patch);
  const diff = describeProposalDiff(original, patch);
  // Explicit fixture confirmation/reload. These are NOT the production auth, RPC or persistence adapters.
  const beforeConfirmation = mutation === "unconfirmed_write" ? candidate : structuredClone(original);
  const final = applyPatch(original, patch);
  return { candidate, diff, beforeConfirmation, rejected: structuredClone(original), final, reloaded: structuredClone(final), candidateSidecar: structuredClone(sidecar), finalSidecar: structuredClone(sidecar), confirmedRevision: "fixture-proposal-r1", confirmedBase: 7, routeAfter: structuredClone(routes.after) };
}
export function runTripSeed(mutation: Parameters<typeof tripSeedTrace>[0] = "none"): SeedResult { return gradeTripTrace(tripSeedTrace(mutation)); }
