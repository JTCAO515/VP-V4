/**
 * TS mirror of 20260914100000_vpj_19_363_place_identity.sql. Pure closed-
 * schema types and validators only — no fetch, no provider transport, no
 * persistence. Keep this file's constraints in lockstep with the migration;
 * a change to one without the other is a bug.
 */

export type PoiCategory = "airport_terminal" | "station_exit" | "scenic_entrance" | "business_branch" | "other";
export type CoordinateSystem = "gcj02" | "wgs84";
export type EntranceSource = "provider_geocode" | "operator_verified";
export type Provider = "amap" | "tencent";

export type KnownEntrance = Readonly<{ known: true; lat: number; lng: number; coordinateSystem: CoordinateSystem; source: EntranceSource }>;
export type UnknownEntrance = Readonly<{ known: false }>;
export type CanonicalPoiEntrance = KnownEntrance | UnknownEntrance;

export type CanonicalPoiIdentity = Readonly<{
  id: string;
  primaryNameZh: string;
  primaryNameEn: string;
  namePinyin: string | null;
  category: PoiCategory;
  parentPoiId: string | null;
  entrance: CanonicalPoiEntrance;
}>;

export type ProviderPoiMapping = Readonly<{
  canonicalPoiId: string;
  provider: Provider;
  providerPoiId: string;
  rawName: string;
  matchedAt: string;
}>;

/** A raw provider search hit, not yet matched to any canonical place. */
export type PlaceSearchCandidate = Readonly<{
  provider: Provider;
  providerPoiId: string;
  rawName: string;
  /** Set only when this provider id already has a mapping row; never inferred by name/vector similarity. */
  matchedCanonicalPoiId: string | null;
}>;

const CATEGORIES: readonly PoiCategory[] = ["airport_terminal", "station_exit", "scenic_entrance", "business_branch", "other"];
const PROVIDERS: readonly Provider[] = ["amap", "tencent"];
const COORDINATE_SYSTEMS: readonly CoordinateSystem[] = ["gcj02", "wgs84"];
const ENTRANCE_SOURCES: readonly EntranceSource[] = ["provider_geocode", "operator_verified"];

const boundedName = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= max;

const uuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function isValidCanonicalPoiEntrance(value: unknown): value is CanonicalPoiEntrance {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (v.known === false) return Object.keys(v).length === 1;
  if (v.known !== true) return false;
  if (Object.keys(v).length !== 5) return false;
  return typeof v.lat === "number" && Number.isFinite(v.lat) && Math.abs(v.lat) <= 90
    && typeof v.lng === "number" && Number.isFinite(v.lng) && Math.abs(v.lng) <= 180
    && COORDINATE_SYSTEMS.includes(v.coordinateSystem as CoordinateSystem)
    && ENTRANCE_SOURCES.includes(v.source as EntranceSource);
}

export function isValidCanonicalPoiIdentity(value: unknown): value is CanonicalPoiIdentity {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (!uuid(v.id)) return false;
  if (!boundedName(v.primaryNameZh, 160) || !boundedName(v.primaryNameEn, 160)) return false;
  if (v.namePinyin !== null && !boundedName(v.namePinyin, 160)) return false;
  if (!CATEGORIES.includes(v.category as PoiCategory)) return false;
  if (v.parentPoiId !== null && !uuid(v.parentPoiId)) return false;
  return isValidCanonicalPoiEntrance(v.entrance);
}

export function isValidProviderPoiMapping(value: unknown): value is ProviderPoiMapping {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return uuid(v.canonicalPoiId) && PROVIDERS.includes(v.provider as Provider)
    && typeof v.providerPoiId === "string" && v.providerPoiId.length >= 1 && v.providerPoiId.length <= 128
    && boundedName(v.rawName, 200)
    && typeof v.matchedAt === "string" && !Number.isNaN(Date.parse(v.matchedAt));
}

/**
 * Groups raw search hits into disambiguation groups by provider id already
 * being mapped to the same canonical place. Never merges by name or vector
 * similarity — an unmapped hit is always its own group, left for the user
 * (or a later explicit mapping step) to resolve, never auto-merged.
 */
export function groupSearchCandidatesByCanonicalMatch(
  candidates: readonly PlaceSearchCandidate[],
): readonly Readonly<{ canonicalPoiId: string | null; candidates: readonly PlaceSearchCandidate[] }>[] {
  const matched = new Map<string, PlaceSearchCandidate[]>();
  const unmatched: PlaceSearchCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate.matchedCanonicalPoiId === null) { unmatched.push(candidate); continue; }
    const group = matched.get(candidate.matchedCanonicalPoiId) ?? [];
    group.push(candidate);
    matched.set(candidate.matchedCanonicalPoiId, group);
  }
  return [
    ...[...matched.entries()].map(([canonicalPoiId, group]) => Object.freeze({ canonicalPoiId, candidates: Object.freeze(group) })),
    ...unmatched.map((candidate) => Object.freeze({ canonicalPoiId: null, candidates: Object.freeze([candidate]) })),
  ];
}
