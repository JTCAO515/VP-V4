import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidCanonicalPoiIdentity,
  isValidCanonicalPoiEntrance,
  isValidProviderPoiMapping,
  groupSearchCandidatesByCanonicalMatch,
} from "../../../lib/server/maps/place-identity.ts";

const UUID_A = "3a683bd8-a757-42df-ae89-27c2e28c8dc7";
const UUID_B = "c6864370-ddec-4eef-9a7c-927151351102";

test("valid canonical POI with a known entrance passes", () => {
  assert.equal(isValidCanonicalPoiIdentity({
    id: UUID_A, primaryNameZh: "广州塔", primaryNameEn: "Canton Tower", namePinyin: "Guangzhou Ta",
    category: "scenic_entrance", parentPoiId: null,
    entrance: { known: true, lat: 23.1066, lng: 113.3245, coordinateSystem: "gcj02", source: "provider_geocode" },
  }), true);
});

test("valid canonical POI with an explicitly unknown entrance passes", () => {
  assert.equal(isValidCanonicalPoiIdentity({
    id: UUID_A, primaryNameZh: "未知地点", primaryNameEn: "Unknown Place", namePinyin: null,
    category: "other", parentPoiId: null, entrance: { known: false },
  }), true);
});

test("entrance cannot claim known with a missing coordinate system", () => {
  assert.equal(isValidCanonicalPoiEntrance({ known: true, lat: 1, lng: 1, source: "provider_geocode" }), false);
});

test("entrance rejects out-of-range latitude", () => {
  assert.equal(isValidCanonicalPoiEntrance({ known: true, lat: 200, lng: 1, coordinateSystem: "gcj02", source: "provider_geocode" }), false);
});

test("name over 160 chars is rejected", () => {
  assert.equal(isValidCanonicalPoiIdentity({
    id: UUID_A, primaryNameZh: "x".repeat(161), primaryNameEn: "y",
    namePinyin: null, category: "other", parentPoiId: null, entrance: { known: false },
  }), false);
});

test("category must be one of the closed set", () => {
  assert.equal(isValidCanonicalPoiIdentity({
    id: UUID_A, primaryNameZh: "x", primaryNameEn: "y",
    namePinyin: null, category: "restaurant", parentPoiId: null, entrance: { known: false },
  }), false);
});

test("valid provider POI mapping passes", () => {
  assert.equal(isValidProviderPoiMapping({
    canonicalPoiId: UUID_A, provider: "amap", providerPoiId: "B0001FFTKA", rawName: "广州塔",
    matchedAt: "2026-09-14T00:00:00Z",
  }), true);
});

test("provider POI id over 128 chars is rejected", () => {
  assert.equal(isValidProviderPoiMapping({
    canonicalPoiId: UUID_A, provider: "amap", providerPoiId: "x".repeat(129), rawName: "y",
    matchedAt: "2026-09-14T00:00:00Z",
  }), false);
});

test("unknown provider is rejected (closed set)", () => {
  assert.equal(isValidProviderPoiMapping({
    canonicalPoiId: UUID_A, provider: "google", providerPoiId: "abc", rawName: "y",
    matchedAt: "2026-09-14T00:00:00Z",
  }), false);
});

test("grouping never merges candidates by name similarity, only by an existing mapped id", () => {
  const candidates = [
    { provider: "amap", providerPoiId: "B0001", rawName: "广州塔", matchedCanonicalPoiId: UUID_A },
    { provider: "tencent", providerPoiId: "T0001", rawName: "广州塔(旅游区)", matchedCanonicalPoiId: UUID_A },
    { provider: "amap", providerPoiId: "B9999", rawName: "广州塔纪念品店", matchedCanonicalPoiId: null },
    { provider: "tencent", providerPoiId: "T9999", rawName: "广州塔纪念品店", matchedCanonicalPoiId: null },
  ];
  const groups = groupSearchCandidatesByCanonicalMatch(candidates);
  const matchedGroup = groups.find((g) => g.canonicalPoiId === UUID_A);
  assert.equal(matchedGroup.candidates.length, 2);
  const unmatchedGroups = groups.filter((g) => g.canonicalPoiId === null);
  assert.equal(unmatchedGroups.length, 2, "same-name unmatched hits stay separate, not auto-merged");
});
