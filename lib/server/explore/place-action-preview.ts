import { applyPatch, type TripPatch, type TripSnapshot } from "../trip/patch/contract.ts";
import { assemblePlanFeasibility, type PlanEvidence } from "../trip/feasibility/assembly.ts";
import type { PlaceActionContext } from "./place-action-context.ts";
import type { PlaceMutation } from "./place-action-contract.ts";

export function preparePlaceAdd(context: PlaceActionContext, input: Extract<PlaceMutation, { action: "add" }>) {
  const day = context.snapshot.days.find(d => d.id === input.dayId);
  if (!day || context.snapshot.days.some(d => d.items?.some(i => i.id === input.itemId))) return null;
  const patch: TripPatch = { expectedVersion: context.tripVersion, operations: [{ kind: "upsert_item", itemId: input.itemId, dayId: input.dayId, title: context.displayTitle, startsAt: input.startsAt, endsAt: input.endsAt }] };
  let after: TripSnapshot;
  try { after = applyPatch(context.snapshot, patch); } catch { return null; }
  const timed = (snapshot: TripSnapshot) => (snapshot.days.find(d => d.id === input.dayId)?.items ?? [])
    .filter(i => i.startsAt && i.endsAt).sort((a, b) => Date.parse(a.startsAt!) - Date.parse(b.startsAt!) || a.id.localeCompare(b.id));
  const before = timed(context.snapshot), next = timed(after), index = next.findIndex(i => i.id === input.itemId);
  const pairs = (items: typeof next) => items.slice(0, -1).map((item, i) => ({ fromItemId: item.id, toItemId: items[i + 1].id, departureAt: item.endsAt! }));
  const removed = pairs(before).filter(p => !pairs(next).some(q => q.fromItemId === p.fromItemId && q.toItemId === p.toItemId));
  const affectedDirectedEdges = [index > 0 ? { fromItemId: next[index - 1].id, toItemId: input.itemId, departureAt: next[index - 1].endsAt! } : null,
    index < next.length - 1 ? { fromItemId: input.itemId, toItemId: next[index + 1].id, departureAt: input.endsAt } : null].filter(p => p !== null);
  // Only qualified time windows can support opening. Address/location never supports feasibility.
  const opening = context.sourceCandidates.some(c => c.scope === "opening_window_reference" && c.claim.claimType === "time_window" && c.claim.value.endsAt
    && c.claim.value.timeZone === day.timeZone && Date.parse(input.startsAt) >= Date.parse(c.claim.value.startsAt) && Date.parse(input.endsAt) <= Date.parse(c.claim.value.endsAt));
  const evidence: PlanEvidence[] = context.sourceCandidates.length ? [{ itemId: input.itemId, canonicalPoiId: input.selection.canonicalPoiId, current: true, entityBound: true,
    opening: opening ? "open" : "unknown", reservation: "unknown", reservationCurrent: false }] : [];
  const basis = { tripId: context.tripId, proposalId: input.operationId, proposalRevision: 1, baseVersion: context.tripVersion, proposalDigest: context.contextDigest, after };
  const evaluation = assemblePlanFeasibility(basis, { partySize: 1, currency: "CNY", maxBudgetMinor: null, minTransferMinutes: 0, baggageBufferMinutes: 0, appointmentBufferMinutes: 0, maxWalkingMinutes: null }, evidence, [], context.sourceCandidates.map(c => ({ mappingId: c.mappingId, mappingVersion: c.mappingVersion, sourceDigest: c.sourceDigest, claimRevision: c.claimRevision })));
  // Engine neutral defaults are not user needs. Keep these unprovided constraints explicitly pending.
  const lines = [...evaluation.lines,
    { itemId: input.itemId, constraint: "stay_duration", status: "pending" as const, reason: "USER_WINDOW_NOT_SOURCED_STAY_DURATION" },
    { itemId: null, constraint: "explicit_buffers_budget_party", status: "pending" as const, reason: "EXPLICIT_NEEDS_REQUIRED" }];
  return { patch, after, preview: { kind: "place_add_preview/1", tripId: context.tripId, baseVersion: context.tripVersion, selection: context.selection,
    mappingDigest: context.mappingDigest, contextDigest: context.contextDigest, status: lines.some(l => l.status === "violated") ? "infeasible" : "pending", lines,
    affectedDirectedEdges, removedDirectedEdges: removed, matrix: { candidates: 1, affectedElements: affectedDirectedEdges.length, concurrency: 0, providerCalls: 0, billingUnit: "unknown", cost: "unknown" },
    routeObservedAt: null, sourceExpiresAt: context.expiresAt, tripMutation: "none", confirmation: "original_proposal_diff_confirm", userWindow: "explicit_choice_not_source_evidence" } };
}
