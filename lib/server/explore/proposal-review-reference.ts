import { uuid, revision, exact, record } from "./place-action-base.ts";
export type PlaceProposalReference = { id: string; revision: number; digest: string; baseVersion: number };
export function placeProposalReference(v: unknown): PlaceProposalReference | null {
  return record(v) && exact(v, ["id", "revision", "digest", "baseVersion"]) && uuid(v.id) && revision(v.revision) && v.revision > 0
    && typeof v.digest === "string" && /^trip-v2:[a-f0-9]{64}$/.test(v.digest) && revision(v.baseVersion) ? structuredClone(v) as PlaceProposalReference : null;
}
export function matchesPlaceProposalReference(reference: PlaceProposalReference, value: { trip: { id: string }; proposal: { id: string; revision: number; digest?: string; baseTripVersion: number; stale?: boolean } }, tripId: string) {
  return value.trip.id === tripId && value.proposal.id === reference.id && value.proposal.revision === reference.revision && value.proposal.digest === reference.digest
    && value.proposal.baseTripVersion === reference.baseVersion && value.proposal.stale === false;
}
