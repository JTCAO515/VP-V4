import { record, exact, revision, digest, itemId, uuid, selection, type PlaceSelection } from "./place-action-base.ts";
export { record, exact, revision, digest, itemId, uuid, selection, boundedUnicode, type PlaceSelection } from "./place-action-base.ts";
import { feasibilityRequest } from "../trip/feasibility/native-http.ts";

export type PlacePlanInput = NonNullable<ReturnType<typeof feasibilityRequest>>;

export type PlaceActionBasis = Readonly<{ expectedTripVersion: number; selection: PlaceSelection; expectedMappingDigest: string }>;
export type PlaceMutation = PlaceActionBasis & Readonly<{ operationId: string }> & (
  | Readonly<{ action: "save"; expectedSaveRevision: number }>
  | Readonly<{ action: "unsave"; referenceId: string; expectedSaveRevision: number }>
  | Readonly<{ action: "add"; dayId: string; itemId: string; startsAt: string; endsAt: string; locale: "zh" | "en" }>
);
export type PlaceActionInput =
  | Readonly<{ action: "context"; expectedTripVersion: number; selection: PlaceSelection; locale: "zh" | "en" }>
  | Readonly<{ action: "saved"; expectedTripVersion: number; locale: "zh" | "en"; limit: number; cursor: { contextDigest: string; afterCanonicalPoiId: string } | null }>
  | (PlaceActionBasis & Readonly<{ action: "ask"; locale: "zh" | "en" }>)
  | PlaceMutation
  | Readonly<{ action: "receipt"; request: PlaceMutation }>
  | Readonly<{ action: "abandon"; request: PlaceMutation }>;
export type PlaceEvaluationInput = Readonly<{ action: "evaluate"; request: Extract<PlaceMutation, { action: "add" }>; plan: Omit<PlacePlanInput, "proposalId" | "expectedProposalRevision" | "expectedBaseVersion"> }>;

import { parsePlaceCommand } from "./place-action-command.ts";
export function parsePlaceAction(v: unknown): PlaceActionInput | PlaceEvaluationInput | null {
  if (record(v) && v.action === "evaluate") {
    if (!exact(v, ["action", "request", "plan"]) || !record(v.plan) || !exact(v.plan, ["needs", "placeChoices", "routeRequests"])) return null;
    const request = parsePlaceCommand(v.request, false);
    if (!request || request.action !== "add" || !feasibilityRequest({ ...v.plan, proposalId: request.operationId, expectedProposalRevision: 1, expectedBaseVersion: request.expectedTripVersion })) return null;
    return structuredClone(v) as PlaceEvaluationInput;
  }
  return parsePlaceCommand(v);
}
