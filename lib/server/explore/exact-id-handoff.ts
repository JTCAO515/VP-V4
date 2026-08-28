import { isUuid } from "../identity/request-guards.ts";

export type ExploreReadiness =
  | "current"
  | "recheck_required"
  | "unavailable";

export type ExploreHandoff =
  | Readonly<{
      kind: "ask_ready";
      href: string;
      poiId: string;
      readiness: Exclude<ExploreReadiness, "unavailable">;
    }>
  | Readonly<{
      kind: "proposal_unavailable";
      reason: "NO_ELIGIBLE_EVIDENCE";
    }>
  | Readonly<{ kind: "invalid_scope" }>;

/**
 * Creates a navigation-only Ask handoff from an already-selected canonical POI.
 *
 * This module intentionally owns neither lookup nor Proposal creation. It rejects
 * display labels and unknown identifiers rather than attempting to recover them,
 * so a caller cannot turn card copy into a different place identity or a Trip write.
 */
export function prepareExploreHandoff(input: unknown): ExploreHandoff {
  if (!isExploreHandoffInput(input)) {
    return { kind: "invalid_scope" };
  }

  if (input.readiness === "unavailable") {
    return {
      kind: "proposal_unavailable",
      reason: "NO_ELIGIBLE_EVIDENCE",
    };
  }

  return {
    kind: "ask_ready",
    href: `/visepanda/ask?tripId=${input.tripId}&poiId=${input.poiId}`,
    poiId: input.poiId,
    readiness: input.readiness,
  };
}

function isExploreHandoffInput(
  input: unknown,
): input is Readonly<{
  tripId: string;
  poiId: string;
  readiness: ExploreReadiness;
}> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return false;
  }

  const candidate = input as Record<string, unknown>;
  return (
    typeof candidate.tripId === "string" &&
    isUuid(candidate.tripId) &&
    typeof candidate.poiId === "string" &&
    isUuid(candidate.poiId) &&
    (candidate.readiness === "current" ||
      candidate.readiness === "recheck_required" ||
      candidate.readiness === "unavailable") &&
    Object.keys(candidate).every(
      (key) => key === "tripId" || key === "poiId" || key === "readiness",
    )
  );
}
