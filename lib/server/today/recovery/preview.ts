import { applyPatch, assertTripSnapshot, type TripSnapshot, type TripPatch } from "../../trip/patch/contract.ts";
import { describeProposalDiff } from "../../trip/proposal/diff.ts";
import { assemblePlanFeasibility } from "../../trip/feasibility/assembly.ts";
import type { AdapterResult, UserProfileRead } from "../../identity/user-data-adapter.ts";
import { parseRecoveryPreparationInput, type RecoveryPreparationInput, type RecoverySelection } from "./contract.ts";
import { timestamp } from "../../readiness/contract.ts";

export type ReservationBasis = { referenceId: string; revision: number; contentDigest: string; status: "reserved" | "amended" | "cancelled" | "unknown"; evidenceTier: "user_reported" | "artifact_confirmed" | "provider_verified" };
export type RecoverySources = { complete: boolean; reservations: ReservationBasis[] };
export type RecoveryContext = {
  kind: "local_recovery_context/1"; contextId: string; contextDigest: string; tripId: string; baseVersion: number; expiresAt: string;
  profileBasis: { travelPace: "relaxed" | "balanced" | "packed" | null; updatedAt: string | null };
  reservationBasis: ReservationBasis[]; input: RecoveryPreparationInput;
};
export function recoveryProfile(read: AdapterResult<UserProfileRead | null>, lawfulPace: "relaxed" | "balanced" | "packed" | null = null) {
  const p = "error" in read ? null : read.data;
  return p && ["relaxed", "balanced", "packed"].includes(p.travelPace) && timestamp(p.updatedAt) !== null
    ? { travelPace: lawfulPace === p.travelPace ? lawfulPace : null, updatedAt: new Date(timestamp(p.updatedAt)!).toISOString() } : { travelPace: null, updatedAt: null };
}
export const recoveryNeeds = { partySize: 1, currency: "CNY", maxBudgetMinor: null, minTransferMinutes: 0, baggageBufferMinutes: 0, appointmentBufferMinutes: 0, maxWalkingMinutes: null } as const;
// No party/budget/buffer claim follows from these internal unknown-screening values.
export function recoveryScope(snapshot: TripSnapshot, input: RecoveryPreparationInput, sources: RecoverySources, now: number) {
  if (!parseRecoveryPreparationInput(input)) return "INVALID_INPUT";
  try { assertTripSnapshot(snapshot); } catch { return "CURRENT_SNAPSHOT_UNAVAILABLE"; }
  if (snapshot.version !== input.expectedHeadVersion) return "STALE_TRIP_VERSION";
  if ("report" in input) {
    const observed = timestamp(input.report.observedAt)!;
    if (observed > now || observed + 300000 <= now) return "REPORT_RECHECK_REQUIRED";
    if (input.report.kind === "high_risk_unwell") return "HIGH_RISK_UNWELL";
  }
  if (snapshot.days.reduce((n, d) => n + (d.items?.length ?? 0), 0) > 500) return "SCOPE_TOO_LARGE";
  const day = snapshot.days.find(d => d.id === input.dayId);
  if (!day || !input.selectedItemIds.every(id => day.items?.some(i => i.id === id))) return "SELECTED_SCOPE_UNAVAILABLE";
  if ("scope" in input && !day.items?.some(i => i.id === input.scope.itemId)) return "TRANSPORT_SCOPE_UNAVAILABLE";
  const all = snapshot.days.flatMap(d => d.items ?? []);
  if (!input.fixedItemIds.every(id => all.some(i => i.id === id))) return "FIXED_SCOPE_UNAVAILABLE";
  if (!sources.complete) return "RESERVATION_SCOPE_UNAVAILABLE";
  if (sources.reservations.some(r => r.status === "unknown")) return "RESERVATION_STATUS_UNKNOWN";
  if (new Set(input.reservationBindings.map(b => `${b.dayId}/${b.itemId}`)).size !== input.reservationBindings.length) return "RESERVATION_BINDING_AMBIGUOUS";
  const fixed = new Set(input.fixedItemIds);
  for (const binding of input.reservationBindings) {
    const reference = sources.reservations.find(r => r.referenceId === binding.referenceId && r.revision === binding.revision);
    if (!reference || !all.some(i => i.dayId === binding.dayId && i.id === binding.itemId)) return "RESERVATION_BINDING_STALE";
    if (reference.status === "reserved" || reference.status === "amended") fixed.add(binding.itemId);
  }
  for (const r of sources.reservations) if ((r.status === "reserved" || r.status === "amended") && !input.reservationBindings.some(b => b.referenceId === r.referenceId)) return "FIXED_RESERVATION_UNBOUND";
  if (input.selectedItemIds.some(id => fixed.has(id))) return "FIXED_SCOPE_OVERLAP";
  return null;
}
export function localRecoveryCandidates(snapshot: TripSnapshot, input: RecoveryPreparationInput, sources: RecoverySources, profile: AdapterResult<UserProfileRead | null>, now: number, context: RecoveryContext | null) {
  const reason = recoveryScope(snapshot, input, sources, now);
  const currentProfile = recoveryProfile(profile, context?.profileBasis.travelPace ?? null);
  const preferenceContext = { ...currentProfile, status: currentProfile.travelPace === null ? "unknown" : "current", influence: "soft_reference_only", explicitInputPriority: "current_explicit_input" };
  const report = "report" in input ? input.report : null;
  const common = { kind: "local_recovery/1", tripId: context?.tripId ?? null, baseVersion: snapshot.version, report,
    ...( "scope" in input ? { transportReference: { receiptId: input.receiptId, scope: input.scope } } : {}),
    preferenceContext, sourceSemantics: report ? "user_report" : "qualified_foreground_transport", tripMutation: "none", externalOutcome: "unknown",
    nextStep: report?.kind === "high_risk_unwell" ? "stop_and_seek_local_help" : "review_optional_items_and_check_original_supplier",
    officialChannel: { status: "unavailable", reason: "NO_QUALIFIED_OFFICIAL_CHANNEL" },
    candidates: [] as unknown[], needsManualVerification: ["ONWARD_ROUTE", "OPENING", "RESERVATION", "EXTERNAL_CANCELLATION_REFUND"] };
  if (reason || !context) return { ...common, status: "pending", reason: reason ?? "RECOVERY_AUTHORITY_UNAVAILABLE" };
  const profileBasis = recoveryProfile(profile, context.profileBasis.travelPace);
  if (context.baseVersion !== snapshot.version || context.input.operationId !== input.operationId || context.expiresAt === "" || timestamp(context.expiresAt) === null
    || timestamp(context.expiresAt)! <= now || timestamp(context.expiresAt)! > (report ? timestamp(report.observedAt)! : now) + 300000
    || ("scope" in input && input.scope.tripId !== context.tripId)
    || context.profileBasis.travelPace !== profileBasis.travelPace || timestamp(context.profileBasis.updatedAt) !== timestamp(profileBasis.updatedAt)) return { ...common, status: "pending", reason: "STALE_CONTEXT" };
  const choices: { candidateId: RecoverySelection["candidateId"]; ids: string[] }[] = [{ candidateId: "omit_one", ids: input.selectedItemIds.slice(0, 1) }];
  if (input.selectedItemIds.length > 1) choices.push({ candidateId: "omit_selected", ids: input.selectedItemIds });
  if (preferenceContext.travelPace === "relaxed") choices.reverse();
  const candidates = choices.map(choice => {
    const patch: TripPatch = { expectedVersion: snapshot.version, operations: choice.ids.map(itemId => ({ kind: "delete_item", dayId: input.dayId, itemId })) };
    const next = applyPatch(snapshot, patch);
    const screening = assemblePlanFeasibility({ tripId: context.tripId, proposalId: context.contextId, proposalRevision: 1,
      baseVersion: snapshot.version, proposalDigest: context.contextDigest, after: next }, recoveryNeeds, [], []);
    return { candidateId: choice.candidateId, disposition: "candidate_only", action: "omit_explicit_optional_items", omittedItemIds: choice.ids,
      patch, dayDiffs: describeProposalDiff(snapshot, patch).dayDiffs, feasibility: { status: screening.status, lines: screening.lines },
      fixedItemIds: [...new Set([...input.fixedItemIds, ...input.reservationBindings.filter(b => sources.reservations.some(r => r.referenceId === b.referenceId && ["reserved", "amended"].includes(r.status))).map(b => b.itemId)])],
      unchangedItemIds: snapshot.days.flatMap(d => d.items ?? []).filter(i => !choice.ids.includes(i.id)).map(i => i.id),
      label: input.locale === "zh" ? `从行程中省略 ${choice.ids.length} 个明确可变项目` : `Omit ${choice.ids.length} explicitly optional item${choice.ids.length > 1 ? "s" : ""}` };
  }).filter(c => c.feasibility.status !== "infeasible");
  return { ...common, tripId: context.tripId, status: candidates.length ? "candidates" : "pending", reason: candidates.length ? null : "CANNOT_SAFELY_REPAIR_FIXED_WINDOWS",
    contextId: context.contextId, contextDigest: context.contextDigest, expiresAt: context.expiresAt,
    reservationBasis: context.reservationBasis, candidates };
}
