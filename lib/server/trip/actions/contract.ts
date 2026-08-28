export type TripActionKind = "user_ticket" | "reservation" | "official_handoff" | "preparation";
export type TripActionSource = "trip";
export type TripActionStatus = "current" | "recheck_required" | "unavailable";
export type TripActionReference = Readonly<{ id: string; kind: TripActionKind; source: TripActionSource; status: TripActionStatus; label: string; externalLinkUrl: string | null }>;
export type TripActionProjection = TripActionReference & Readonly<{ outcome: "current" | "recheck_required" | "unavailable" }>;

export function projectTripActions(references: readonly TripActionReference[]): readonly TripActionProjection[] {
  return references.map((reference) => ({
    ...reference,
    outcome: reference.status === "recheck_required" ? "recheck_required" : reference.status === "current" && reference.externalLinkUrl ? "current" : "unavailable",
  }));
}
