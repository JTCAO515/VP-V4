import assert from "node:assert/strict";
import test from "node:test";
import { isCanonicalTripPlaceReference, type TripPlaceReference } from "../../../lib/server/trip/place/contract.ts";

test("V4-11 keeps canonical and user place identities disjoint", () => {
  const canonical: TripPlaceReference = { id: "a", kind: "canonical", canonicalPoiId: "1b47b7c5-4e8c-41fd-8e9a-4d850e01f66e", freshness: "recheck_required", createdAt: "2026-08-28T00:00:00Z" };
  const user: TripPlaceReference = { id: "b", kind: "user", label: "My hotel note", freshness: "current", createdAt: "2026-08-28T00:00:00Z" };
  assert.equal(isCanonicalTripPlaceReference(canonical), true);
  assert.equal(isCanonicalTripPlaceReference(user), false);
});
