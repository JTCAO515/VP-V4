export type CanonicalTripPlaceReference = Readonly<{ id: string; kind: "canonical"; canonicalPoiId: string; freshness: "current" | "recheck_required"; createdAt: string }>;
export type UserTripPlaceReference = Readonly<{ id: string; kind: "user"; label: string; freshness: "current" | "recheck_required"; createdAt: string }>;
export type TripPlaceReference = CanonicalTripPlaceReference | UserTripPlaceReference;

export function isCanonicalTripPlaceReference(value: TripPlaceReference): value is CanonicalTripPlaceReference {
  return value.kind === "canonical";
}
