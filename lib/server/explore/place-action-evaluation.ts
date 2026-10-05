import { assemblePlanFeasibility } from "../trip/feasibility/assembly.ts";
import { readPlanPlaceEvidence, type ExplicitPlaceChoice } from "../trip/feasibility/evidence.ts";
import { readPlanRouteEvidence } from "../trip/feasibility/routes.ts";
import { readConfirmedReservationConstraints, reservationConstraintLines, reservationPlanningBasis } from "../reservations/planning.ts";
import { preparePlaceAdd } from "./place-action-preview.ts";
import type { PlaceActionContext } from "./place-action-context.ts";
import type { PlaceEvaluationInput, PlaceMutation } from "./place-action-contract.ts";
import { PlaceActionError, type PlaceRPC, type ProposalReview } from "./place-action-service.ts";

export async function evaluatePlaceAdd(context: PlaceActionContext, request: Extract<PlaceMutation, { action: "add" }>, proposal: ProposalReview, plan: PlaceEvaluationInput["plan"],
  ports: { rpc: PlaceRPC; current: () => Promise<boolean>; quota: () => Promise<boolean>; signal: AbortSignal; fetcher: typeof fetch; env: Readonly<Record<string, string | undefined>> }) {
  const prepared = preparePlaceAdd(context, request);
  if (!prepared) throw new PlaceActionError("INVALID_INPUT");
  const basis = { tripId: context.tripId, proposalId: proposal.id, proposalRevision: proposal.revision, baseVersion: proposal.baseVersion, proposalDigest: proposal.digest, after: proposal.after };
  const choices: ExplicitPlaceChoice[] = [...plan.placeChoices];
  if (context.referenceId && !choices.some(c => c.itemId === request.itemId)) {
    const candidate = context.sourceCandidates.find(c => c.scope === "opening_window_reference") ?? context.sourceCandidates[0];
    if (candidate) choices.push({ dayId: request.dayId, itemId: request.itemId, placeReferenceId: context.referenceId, mappingId: candidate.mappingId,
      expectedMappingVersion: candidate.mappingVersion, city: candidate.city, scene: candidate.scene, locale: candidate.locale });
  }
  if (choices.length > 40) throw new PlaceActionError("INVALID_INPUT");
  const evidence = await readPlanPlaceEvidence(basis, choices, ports.rpc);
  const edges = prepared.preview.affectedDirectedEdges;
  // A single edit may affect two directed edges, but the existing reader permits
  // just one explicitly selected foreground leg per operation (at most five calls).
  const requests = (plan.routeRequests ?? []).filter(r => edges.some(e => e.fromItemId === r.fromItemId && e.toItemId === r.toItemId));
  if (requests.length !== (plan.routeRequests ?? []).length) throw new PlaceActionError("INVALID_INPUT");
  let quota = false;
  const routes = await readPlanRouteEvidence(basis, evidence.items, requests, { env: ports.env, signal: ports.signal, fetcher: ports.fetcher,
    beforeRequest: async () => {
      if (!await ports.current() || ports.signal.aborted) return false;
      // Requalify reviewed place/source and the exact original proposal before
      // each existing Maps request. No acquired evidence is promoted by consent.
      const again = await readPlanPlaceEvidence(basis, choices, ports.rpc);
      if (JSON.stringify(evidence.bindings) !== JSON.stringify(again.bindings)) return false;
      if (!quota) { if (!await ports.quota()) return false; quota = true; }
      return true;
    } });
  const reservations = await readConfirmedReservationConstraints(context.tripId, context.tripVersion, ports.rpc);
  const result = assemblePlanFeasibility(basis, plan.needs, evidence.items, routes.routes, [...evidence.bindings, ...routes.bindings]);
  const again = await readPlanPlaceEvidence(basis, choices, ports.rpc);
  const currentReservations = await readConfirmedReservationConstraints(context.tripId, context.tripVersion, ports.rpc);
  if (!await ports.current() || JSON.stringify(again.bindings) !== JSON.stringify(evidence.bindings)
    || JSON.stringify(reservationPlanningBasis(reservations)) !== JSON.stringify(reservationPlanningBasis(currentReservations))) throw new PlaceActionError("MAPPING_CHANGED");
  const lines = [...result.lines, ...reservationConstraintLines(reservations),
    { itemId: request.itemId, constraint: "stay_duration", status: "pending" as const, reason: "USER_WINDOW_NOT_SOURCED_STAY_DURATION" },
    ...(context.sourceCandidatesStatus === "unavailable" ? [{ itemId: request.itemId, constraint: "source_reader", status: "pending" as const, reason: "SOURCE_READER_UNAVAILABLE" }] : [])];
  return { ...result, kind: "place_add_evaluation/1", status: lines.some(l => l.status === "violated") ? "infeasible" : lines.some(l => l.status === "pending") ? "pending" : "feasible", lines,
    missingEvidence: lines.filter(l => l.status === "pending"), selection: context.selection, mappingDigest: context.mappingDigest,
    affectedDirectedEdges: edges, removedDirectedEdges: prepared.preview.removedDirectedEdges, evaluatedAt: new Date().toISOString(), expiresAt: context.expiresAt,
    routeObservations: routes.bindings, matrix: { candidates: 1, affectedElements: edges.length, requestedElements: requests.length, maxProviderCalls: requests.length ? 5 : 0,
      concurrency: 1, billingUnit: "unknown", cost: "unknown" }, confirmation: "original_proposal_diff_confirm" };
}
