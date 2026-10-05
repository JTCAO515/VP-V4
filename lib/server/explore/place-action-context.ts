import { assertTripSnapshot, type TripSnapshot } from "../trip/patch/contract.ts";
import { assertGroundedClaim, type GroundedClaim } from "../contracts/index.ts";
import { KNOWLEDGE_CITIES, KNOWLEDGE_SCENES } from "../knowledge/publication/statement.ts";
import { isUuid } from "../identity/request-guards.ts";
import { record, exact, revision, digest, selection, type PlaceSelection } from "./place-action-base.ts";

export type PlaceSourceCandidate = Readonly<{
  mappingId: string; mappingVersion: number; mappingDigest: string; statementId: string; claimRevision: number;
  payloadHash: string; sourceDigest: string; scope: "address_reference" | "opening_window_reference";
  claim: GroundedClaim; city: string; scene: string; locale: "zh" | "en";
}>;
export type PlaceActionContext = Readonly<{
  kind: "place_action_context"; tripId: string; tripVersion: number; selection: PlaceSelection;
  mappingDigest: string; contextDigest: string; snapshot: TripSnapshot; displayTitle: string;
  referenceId: string | null;
  saved: Readonly<{ referenceId: string; revision: number; status: "saved" | "unsaved"; mappingDigest: string }> | null;
  sourceCandidates: readonly PlaceSourceCandidate[]; sourceCandidatesStatus: "complete" | "unavailable"; evaluatedAt: string; expiresAt: string;
}>;
export const sameSelection = (a: PlaceSelection, b: PlaceSelection) => a.canonicalPoiId === b.canonicalPoiId && a.provider === b.provider && a.providerPoiId === b.providerPoiId;
export function decodePlaceContext(v: unknown, tripId: string, input: { expectedTripVersion: number; selection: PlaceSelection; locale: "zh" | "en" }, now = Date.now()): PlaceActionContext | null {
  if (!record(v) || !exact(v, ["kind", "tripId", "tripVersion", "selection", "mappingDigest", "contextDigest", "snapshot", "displayTitle", "referenceId", "saved", "sourceCandidates", "sourceCandidatesStatus", "evaluatedAt", "expiresAt"])
    || v.kind !== "place_action_context" || v.tripId !== tripId || v.tripVersion !== input.expectedTripVersion || !selection(v.selection) || !sameSelection(v.selection, input.selection)
    || !digest(v.mappingDigest) || !digest(v.contextDigest) || typeof v.displayTitle !== "string" || !v.displayTitle.trim() || v.displayTitle.length > 160
    || !(v.referenceId === null || typeof v.referenceId === "string" && isUuid(v.referenceId)) || typeof v.evaluatedAt !== "string" || typeof v.expiresAt !== "string") return null;
  const evaluated = Date.parse(v.evaluatedAt), expires = Date.parse(v.expiresAt);
  if (!Number.isFinite(evaluated) || !Number.isFinite(expires) || evaluated > now || now - evaluated >= 30000 || expires <= now || expires - evaluated > 30000) return null;
  try { assertTripSnapshot(v.snapshot); } catch { return null; }
  if (v.snapshot.version !== input.expectedTripVersion || v.snapshot.days.length > 100 || v.snapshot.days.flatMap(d => d.items ?? []).length > 500) return null;
  if (v.saved !== null && (!record(v.saved) || !exact(v.saved, ["referenceId", "revision", "status", "mappingDigest"]) || typeof v.saved.referenceId !== "string" || !isUuid(v.saved.referenceId)
    || !revision(v.saved.revision) || v.saved.revision < 1 || !["saved", "unsaved"].includes(String(v.saved.status)) || !digest(v.saved.mappingDigest))) return null;
  if (!Array.isArray(v.sourceCandidates) || v.sourceCandidates.length > 24 || !["complete", "unavailable"].includes(String(v.sourceCandidatesStatus)) || v.sourceCandidatesStatus === "unavailable" && v.sourceCandidates.length > 0) return null;
  const seen = new Set<string>();
  for (const c of v.sourceCandidates) {
    if (!record(c) || !exact(c, ["mappingId", "mappingVersion", "mappingDigest", "statementId", "claimRevision", "payloadHash", "sourceDigest", "scope", "claim", "city", "scene", "locale"])
      || typeof c.mappingId !== "string" || !isUuid(c.mappingId) || seen.has(c.mappingId) || typeof c.statementId !== "string" || !isUuid(c.statementId)
      || !revision(c.mappingVersion) || c.mappingVersion < 1 || !revision(c.claimRevision) || c.claimRevision < 1 || ![c.mappingDigest, c.payloadHash, c.sourceDigest].every(digest)
      || !["address_reference", "opening_window_reference"].includes(String(c.scope)) || !record(c.claim)
      || (c.scope === "address_reference" ? c.claim.claimType !== "address" : c.claim.claimType !== "time_window")
      || !(KNOWLEDGE_CITIES as readonly unknown[]).includes(c.city) || !(KNOWLEDGE_SCENES as readonly unknown[]).includes(c.scene) || c.locale !== input.locale) return null;
    try { assertGroundedClaim(c.claim as GroundedClaim, now); } catch { return null; }
    // This seam consumes reviewed knowledge only. Provider observations cannot upgrade it.
    if (!Array.isArray(c.claim.evidence) || !c.claim.evidence.length || c.claim.evidence.some(e => !record(e) || e.kind !== "fact" || typeof e.expiresAt !== "string" || Date.parse(e.expiresAt) < expires)) return null;
    seen.add(c.mappingId);
  }
  return structuredClone(v) as PlaceActionContext;
}

/** Clocks renew on each read; every authority-bearing field must stay identical. */
export function samePlaceContext(a: PlaceActionContext, b: PlaceActionContext): boolean {
  const basis = (c: PlaceActionContext) => { const { evaluatedAt: _evaluated, expiresAt: _expires, ...authority } = c; return authority; };
  return JSON.stringify(basis(a)) === JSON.stringify(basis(b));
}
