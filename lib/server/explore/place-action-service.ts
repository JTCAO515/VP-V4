import { prepareExploreHandoff } from "./exact-id-handoff.ts";
import { decodePlaceContext, samePlaceContext, sameSelection, type PlaceActionContext } from "./place-action-context.ts";
import { record, exact, uuid, revision, digest, selection } from "./place-action-base.ts";
import type { PlaceActionInput, PlaceEvaluationInput, PlaceMutation } from "./place-action-contract.ts";
import { preparePlaceAdd } from "./place-action-preview.ts";
import type { TripSnapshot } from "../trip/patch/contract.ts";
import { libraryPlaceCapabilities } from "../library/place-capabilities.ts";

export type PlaceRPC = (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
export type PlaceActionReceipt = Readonly<{
  kind: "place_action_receipt"; tripId: string; operationId: string; action: "save" | "unsave" | "add"; selection: PlaceMutation["selection"];
  tripVersion: number; mappingDigest: string; requestDigest: string; referenceId: string; savedRevision: number | null;
  savedStatus: "saved" | "unsaved" | null; proposal: { proposalId: string; revision: number; baseTripVersion: number } | null;
  historicalOnly: true; currentEligibilityRequiresRead: true;
}>;
export type ProposalReview = { id: string; revision: number; digest: string; baseVersion: number; after: TripSnapshot };
export type PlaceActionPorts = {
  rpc: PlaceRPC; current: () => Promise<boolean>; enabled: () => boolean; now: () => number;
  proposal: (id: string) => Promise<ProposalReview | null>;
  evaluate: (context: PlaceActionContext, request: Extract<PlaceMutation, { action: "add" }>, proposal: ProposalReview, plan: PlaceEvaluationInput["plan"]) => Promise<unknown>;
};
export class PlaceActionError extends Error { code: string; constructor(code: string) { super(code); this.code = code; } }
export type PlaceActionCancelled = Readonly<{ kind: "place_action_cancelled"; tripId: string; operationId: string; action: PlaceMutation["action"]; selection: PlaceMutation["selection"];
  tripVersion: number; mappingDigest: string; requestDigest: string; historicalOnly: true; currentEligibilityRequiresRead: true }>;
export function decodePlaceCancelled(v: unknown, tripId: string, request: PlaceMutation): PlaceActionCancelled | null {
  return record(v) && exact(v, ["kind", "tripId", "operationId", "action", "selection", "tripVersion", "mappingDigest", "requestDigest", "historicalOnly", "currentEligibilityRequiresRead"])
    && v.kind === "place_action_cancelled" && v.tripId === tripId && v.operationId === request.operationId && v.action === request.action && selection(v.selection)
    && sameSelection(v.selection, request.selection) && v.tripVersion === request.expectedTripVersion && v.mappingDigest === request.expectedMappingDigest
    && digest(v.requestDigest) && v.historicalOnly === true && v.currentEligibilityRequiresRead === true ? structuredClone(v) as PlaceActionCancelled : null;
}
const errors = ["INVALID_INPUT", "UNAUTHENTICATED", "FORBIDDEN", "STALE_TRIP_VERSION", "MAPPING_CHANGED", "CAS_CONFLICT", "IDEMPOTENCY_KEY_REUSE", "PROPOSAL_NOT_CONFIRMABLE"];
async function call(ports: PlaceActionPorts, name: string, params: Record<string, unknown>) {
  const result = await ports.rpc(name, params);
  if (result.error) {
    const message = record(result.error) && typeof result.error.message === "string" ? result.error.message : "";
    throw new PlaceActionError(errors.find(code => message.includes(code)) ?? "PLACE_ACTION_UNAVAILABLE");
  }
  return result.data;
}
async function current(ports: PlaceActionPorts) { if (!await ports.current()) throw new PlaceActionError("UNAUTHENTICATED"); }
export function decodePlaceReceipt(v: unknown, tripId: string, request: PlaceMutation): PlaceActionReceipt | null {
  if (!record(v) || !exact(v, ["kind", "tripId", "operationId", "action", "selection", "tripVersion", "mappingDigest", "requestDigest", "referenceId", "savedRevision", "savedStatus", "proposal", "historicalOnly", "currentEligibilityRequiresRead"])
    || v.kind !== "place_action_receipt" || v.tripId !== tripId || v.operationId !== request.operationId || v.action !== request.action || v.tripVersion !== request.expectedTripVersion
    || !selection(v.selection) || !sameSelection(v.selection, request.selection) || v.mappingDigest !== request.expectedMappingDigest || !digest(v.requestDigest) || !uuid(v.referenceId)
    || v.historicalOnly !== true || v.currentEligibilityRequiresRead !== true) return null;
  if (request.action === "add") {
    if (v.savedRevision !== null || v.savedStatus !== null || !record(v.proposal) || !exact(v.proposal, ["proposalId", "revision", "baseTripVersion"]) || !uuid(v.proposal.proposalId)
      || !revision(v.proposal.revision) || v.proposal.revision < 1 || v.proposal.baseTripVersion !== request.expectedTripVersion) return null;
  } else if (v.proposal !== null || !revision(v.savedRevision) || v.savedRevision !== request.expectedSaveRevision + 1 || v.savedStatus !== (request.action === "save" ? "saved" : "unsaved")
    || request.action === "unsave" && v.referenceId !== request.referenceId) return null;
  return structuredClone(v) as PlaceActionReceipt;
}
async function readContext(tripId: string, input: { expectedTripVersion: number; selection: PlaceMutation["selection"]; locale: "zh" | "en" }, ports: PlaceActionPorts) {
  const raw = await call(ports, "read_place_action_context_v1", { p_trip: tripId, p_input: { action: "context", ...input } });
  if (record(raw) && exact(raw, ["kind", "reason"]) && raw.kind === "unavailable") throw new PlaceActionError(["STALE_TRIP_VERSION", "MAPPING_CHANGED"].includes(String(raw.reason)) ? String(raw.reason) : "PLACE_ACTION_UNAVAILABLE");
  const decoded = decodePlaceContext(raw, tripId, input, ports.now());
  if (!decoded) throw new PlaceActionError("PLACE_ACTION_UNAVAILABLE");
  return decoded;
}
async function freshContext(tripId: string, input: { expectedTripVersion: number; selection: PlaceMutation["selection"]; locale: "zh" | "en" }, ports: PlaceActionPorts) {
  await current(ports);
  const first = await readContext(tripId, input, ports);
  const second = await readContext(tripId, input, ports);
  await current(ports);
  if (!samePlaceContext(first, second) || Date.parse(second.expiresAt) <= ports.now()) throw new PlaceActionError("MAPPING_CHANGED");
  return second;
}

export type SavedPlaceActions = Readonly<{ kind: "saved_place_actions"; tripId: string; tripVersion: number; contextDigest: string; hasMore: boolean; nextCursor: { contextDigest: string; afterCanonicalPoiId: string } | null; items: readonly {
  referenceId: string; revision: number; status: "saved"; selection: PlaceMutation["selection"]; mappingDigest: string; displayTitle: string | null; mappingStatus: "current" | "changed" | "unavailable";
}[] }>;
export function decodeSavedPlaceActions(v: unknown, tripId: string, tripVersion: number, limit = 100, cursor: { contextDigest: string; afterCanonicalPoiId: string } | null = null): SavedPlaceActions | null {
  if (!record(v) || !exact(v, ["kind", "tripId", "tripVersion", "contextDigest", "items", "hasMore", "nextCursor"]) || v.kind !== "saved_place_actions" || v.tripId !== tripId || v.tripVersion !== tripVersion
    || !digest(v.contextDigest) || cursor && cursor.contextDigest !== v.contextDigest || typeof v.hasMore !== "boolean" || !Array.isArray(v.items) || v.items.length > limit) return null;
  const seen = new Set<string>();
  let previous = cursor?.afterCanonicalPoiId ?? "";
  for (const row of v.items) {
    if (!record(row) || !exact(row, ["referenceId", "revision", "status", "selection", "mappingDigest", "displayTitle", "mappingStatus"]) || !uuid(row.referenceId) || seen.has(row.referenceId)
      || !revision(row.revision) || row.revision < 1 || row.status !== "saved" || !selection(row.selection) || !digest(row.mappingDigest)
      || row.selection.canonicalPoiId <= previous || !(row.displayTitle === null || typeof row.displayTitle === "string" && row.displayTitle.trim() && row.displayTitle.length <= 160) || !["current", "changed", "unavailable"].includes(String(row.mappingStatus))) return null;
    seen.add(row.referenceId);
    previous = row.selection.canonicalPoiId;
  }
  if (v.hasMore ? !v.items.length || !record(v.nextCursor) || !exact(v.nextCursor, ["contextDigest", "afterCanonicalPoiId"]) || v.nextCursor.contextDigest !== v.contextDigest || v.nextCursor.afterCanonicalPoiId !== previous : v.nextCursor !== null) return null;
  return structuredClone(v) as SavedPlaceActions;
}
async function receipt(tripId: string, request: PlaceMutation, ports: PlaceActionPorts) {
  const raw = await call(ports, "execute_place_action_v1", { p_trip: tripId, p_input: { action: "receipt", request } });
  await current(ports);
  if (record(raw) && exact(raw, ["kind", "tripId", "operationId"]) && raw.kind === "receipt_absent" && raw.tripId === tripId && raw.operationId === request.operationId) return null;
  const decoded = decodePlaceReceipt(raw, tripId, request) ?? decodePlaceCancelled(raw, tripId, request);
  if (!decoded) throw new PlaceActionError("PLACE_ACTION_UNAVAILABLE");
  return decoded;
}
async function review(request: PlaceMutation, result: PlaceActionReceipt, ports: PlaceActionPorts) {
  if (request.action !== "add" || !result.proposal) return null;
  const selected = await ports.proposal(result.proposal.proposalId);
  if (!selected || selected.id !== result.proposal.proposalId || selected.revision !== result.proposal.revision || selected.baseVersion !== result.proposal.baseTripVersion || !/^trip-v2:[a-f0-9]{64}$/.test(selected.digest)) return null;
  const day = selected.after.days.find(d => d.id === request.dayId), item = day?.items?.find(i => i.id === request.itemId);
  if (!item || item.startsAt !== request.startsAt || item.endsAt !== request.endsAt) return null;
  return selected;
}
async function enrich(request: PlaceMutation, result: PlaceActionReceipt, ports: PlaceActionPorts, preview: unknown = null) {
  const selected = await review(request, result, ports);
  await current(ports);
  return { ...result, proposalReview: selected ? { id: selected.id, revision: selected.revision, digest: selected.digest, baseVersion: selected.baseVersion } : null, preview };
}

/** Ordinary actor RPCs only. Historical receipts survive loss of current qualification.
 * New operations never retry automatically and never call a Trip writer or Confirm. */
export async function runPlaceAction(tripId: string, input: PlaceActionInput | PlaceEvaluationInput, ports: PlaceActionPorts): Promise<unknown> {
  await current(ports);
  if (input.action === "saved") {
    const raw = await call(ports, "read_place_action_context_v1", { p_trip: tripId, p_input: input });
    await current(ports);
    const decoded = decodeSavedPlaceActions(raw, tripId, input.expectedTripVersion, input.limit, input.cursor);
    if (!decoded) throw new PlaceActionError("PLACE_ACTION_UNAVAILABLE");
    return decoded;
  }
  if (input.action === "receipt" || input.action === "abandon") {
    if (input.action === "abandon") {
      const raw = await call(ports, "execute_place_action_v1", { p_trip: tripId, p_input: input });
      await current(ports);
      const result = decodePlaceReceipt(raw, tripId, input.request) ?? decodePlaceCancelled(raw, tripId, input.request);
      if (!result) throw new PlaceActionError("PLACE_ACTION_UNAVAILABLE");
      return result.kind === "place_action_cancelled" ? result : enrich(input.request, result, ports);
    }
    const prior = await receipt(tripId, input.request, ports);
    return prior ? prior.kind === "place_action_cancelled" ? prior : enrich(input.request, prior, ports) : { kind: "receipt_absent", tripId, operationId: input.request.operationId };
  }
  if (input.action === "context" || input.action === "ask") {
    const context = await freshContext(tripId, { expectedTripVersion: input.expectedTripVersion, selection: input.selection, locale: input.locale }, ports);
    if (input.action === "context") return context;
    if (context.mappingDigest !== input.expectedMappingDigest) throw new PlaceActionError("MAPPING_CHANGED");
    return { kind: "place_ask_context", tripId, tripVersion: context.tripVersion, selection: context.selection, mappingDigest: context.mappingDigest, contextDigest: context.contextDigest,
      referenceId: context.referenceId, selectedSources: { artifact: null, trip: { tripId, headVersion: context.tripVersion }, evidence: [] }, currentInput: context.selection,
      readyForProvider: false, purpose: "first_party_reference_only", expiresAt: context.expiresAt,
      handoff: context.referenceId ? prepareExploreHandoff({ tripId, poiId: input.selection.canonicalPoiId, readiness: "recheck_required" }) : null };
  }
  if (input.action === "evaluate") {
    const prior = await receipt(tripId, input.request, ports);
    if (!prior || prior.kind === "place_action_cancelled") throw new PlaceActionError("PROPOSAL_NOT_CONFIRMABLE");
    const context = await freshContext(tripId, { expectedTripVersion: input.request.expectedTripVersion, selection: input.request.selection, locale: input.request.locale }, ports);
    if (context.mappingDigest !== input.request.expectedMappingDigest) throw new PlaceActionError("MAPPING_CHANGED");
    const selected = await review(input.request, prior, ports);
    if (!selected) throw new PlaceActionError("PROPOSAL_NOT_CONFIRMABLE");
    const result = await ports.evaluate(context, input.request, selected, input.plan);
    const after = await freshContext(tripId, { expectedTripVersion: input.request.expectedTripVersion, selection: input.request.selection, locale: input.request.locale }, ports);
    const still = await review(input.request, prior, ports);
    if (!samePlaceContext(context, after) || !still || still.digest !== selected.digest) throw new PlaceActionError("MAPPING_CHANGED");
    return result;
  }
  // Read an existing operation before flags/current mapping. Lost ACK recovery
  // must not turn a successfully created proposal into a second write.
  const prior = await receipt(tripId, input, ports);
  if (prior) return prior.kind === "place_action_cancelled" ? prior : enrich(input, prior, ports);
  let preview: unknown = null;
  if (input.action !== "unsave") {
    if (!ports.enabled()) throw new PlaceActionError("PLACE_ACTION_UNAVAILABLE");
    const context = await freshContext(tripId, { expectedTripVersion: input.expectedTripVersion, selection: input.selection, locale: input.action === "add" ? input.locale : "en" }, ports);
    if (context.mappingDigest !== input.expectedMappingDigest) throw new PlaceActionError("MAPPING_CHANGED");
    const capabilities = libraryPlaceCapabilities(input.selection.canonicalPoiId, tripId, context, ports.enabled());
    if (capabilities[input.action].status !== "available") throw new PlaceActionError("PLACE_ACTION_UNAVAILABLE");
    if (input.action === "add") { const prepared = preparePlaceAdd(context, input); if (!prepared) throw new PlaceActionError("INVALID_INPUT"); preview = prepared.preview; }
    if (!ports.enabled()) throw new PlaceActionError("PLACE_ACTION_UNAVAILABLE");
  }
  // Unsave needs owner/reference/CAS, even after withdrawal or mapping removal.
  await current(ports);
  const raw = await call(ports, "execute_place_action_v1", { p_trip: tripId, p_input: input });
  const result = decodePlaceReceipt(raw, tripId, input) ?? decodePlaceCancelled(raw, tripId, input);
  if (!result) throw new PlaceActionError("PLACE_ACTION_UNAVAILABLE");
  return result.kind === "place_action_cancelled" ? result : enrich(input, result, ports, preview);
}
