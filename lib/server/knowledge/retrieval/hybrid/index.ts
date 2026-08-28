import { isEligibleFact, type FactEligibility, type FactStatus } from "../../fact/eligibility.ts";

export type EmbeddingProfileV1 = Readonly<{
  modelId: string;
  region: string;
  dimensions: number;
  indexVersion: string;
}>;

export type RetrievalUnitV1 = Readonly<{
  id: string;
  targetId: string;
  fact: FactEligibility;
}>;

export type RankedRetrievalHitV1 = Readonly<{
  unitId: string;
  rank: number;
  exact?: boolean;
}>;

export type HybridRetrievalInputV1 = Readonly<{
  now: string;
  profile: EmbeddingProfileV1;
  rrfK: number;
  units: readonly RetrievalUnitV1[];
  lexical: readonly RankedRetrievalHitV1[];
  vector: readonly RankedRetrievalHitV1[];
}>;

export type EvidenceItemV1 = Readonly<{
  retrievalUnitId: string;
  targetId: string;
  factId: string;
  lexicalRank?: number;
  vectorRank?: number;
  fusedScore: number;
}>;

export type EvidencePackV1 =
  | Readonly<{ kind: "evidence_pack"; profile: EmbeddingProfileV1; items: readonly EvidenceItemV1[] }>
  | Readonly<{ kind: "no_eligible_evidence"; profile: EmbeddingProfileV1 }>;

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DESCRIPTOR = /^[A-Za-z0-9._-]+$/;
const RFC3339_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|([+-])(\d{2}):(\d{2}))$/;
const FACT_STATUSES = new Set<FactStatus>(["candidate", "draft", "reviewed", "deprecated"]);

export function buildHybridEvidencePack(input: HybridRetrievalInputV1): EvidencePackV1 {
  assertRecord(input, ["now", "profile", "rrfK", "units", "lexical", "vector"]);
  const now = parseTimestamp(input.now, "now");
  const profile = parseProfile(input.profile);
  const rrfK = parseRank(input.rrfK, "rrfK");
  const units = parseUnits(input.units);
  const lexical = parseHits(input.lexical, true);
  const vector = parseHits(input.vector, false);
  const eligible = new Map(units.filter((unit) => isEligibleFact(unit.fact, now)).map((unit) => [unit.id, unit]));
  const lexicalById = knownHits(lexical, eligible);
  const vectorById = knownHits(vector, eligible);
  const exactIds = [...lexicalById.values()]
    .filter((hit) => hit.exact)
    .sort((left, right) => left.rank - right.rank || compareId(left.unitId, right.unitId))
    .map((hit) => hit.unitId);
  const exactItems = exactIds.map((id) => makeItem(id, eligible, lexicalById.get(id), vectorById.get(id), rrfK));
  const hybridItems = [...new Set([...lexicalById.keys(), ...vectorById.keys()])]
    .filter((id) => !exactIds.includes(id))
    .map((id) => makeItem(id, eligible, lexicalById.get(id), vectorById.get(id), rrfK))
    .sort((left, right) => right.fusedScore - left.fusedScore || compareId(left.retrievalUnitId, right.retrievalUnitId));
  const items = [...exactItems, ...hybridItems];

  return items.length === 0
    ? { kind: "no_eligible_evidence", profile }
    : { kind: "evidence_pack", profile, items };
}

function makeItem(
  id: string,
  eligible: ReadonlyMap<string, RetrievalUnitV1>,
  lexical: RankedRetrievalHitV1 | undefined,
  vector: RankedRetrievalHitV1 | undefined,
  rrfK: number,
): EvidenceItemV1 {
  const unit = eligible.get(id);
  if (!unit) throw new TypeError("eligible retrieval unit disappeared");
  const fusedScore = (lexical ? 1 / (rrfK + lexical.rank) : 0) + (vector ? 1 / (rrfK + vector.rank) : 0);
  return {
    retrievalUnitId: unit.id,
    targetId: unit.targetId,
    factId: unit.fact.id,
    ...(lexical ? { lexicalRank: lexical.rank } : {}),
    ...(vector ? { vectorRank: vector.rank } : {}),
    fusedScore,
  };
}

function knownHits(
  hits: readonly RankedRetrievalHitV1[],
  eligible: ReadonlyMap<string, RetrievalUnitV1>,
): ReadonlyMap<string, RankedRetrievalHitV1> {
  return new Map(hits.filter((hit) => eligible.has(hit.unitId)).map((hit) => [hit.unitId, hit]));
}

function parseUnits(value: unknown): readonly RetrievalUnitV1[] {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError("units must be a non-empty array");
  const ids = new Set<string>();
  const factIds = new Set<string>();
  return value.map((candidate) => {
    assertRecord(candidate, ["id", "targetId", "fact"]);
    const id = parseId(candidate.id, "unit id");
    const targetId = parseId(candidate.targetId, "target id");
    if (ids.has(id)) throw new TypeError("duplicate unit id");
    ids.add(id);
    assertRecord(candidate.fact, ["id", "status", "expiresAt", "licenceAllowed"]);
    const fact: FactEligibility = {
      id: parseId(candidate.fact.id, "fact id"),
      status: parseFactStatus(candidate.fact.status),
      expiresAt: parseTimestamp(candidate.fact.expiresAt, "fact expiresAt").toISOString(),
      licenceAllowed: parseBoolean(candidate.fact.licenceAllowed, "fact licenceAllowed"),
    };
    if (factIds.has(fact.id)) throw new TypeError("duplicate fact id");
    factIds.add(fact.id);
    return { id, targetId, fact };
  });
}

function parseHits(value: unknown, allowExact: boolean): readonly RankedRetrievalHitV1[] {
  if (!Array.isArray(value)) throw new TypeError("hits must be an array");
  const ids = new Set<string>();
  return value.map((candidate) => {
    assertRecord(candidate, allowExact ? ["unitId", "rank", "exact"] : ["unitId", "rank"]);
    const unitId = parseId(candidate.unitId, "hit unitId");
    if (ids.has(unitId)) throw new TypeError("duplicate hit unitId");
    ids.add(unitId);
    const rank = parseRank(candidate.rank, "hit rank");
    return allowExact
      ? { unitId, rank, exact: parseBoolean(candidate.exact, "exact") }
      : { unitId, rank };
  });
}

function parseProfile(value: unknown): EmbeddingProfileV1 {
  assertRecord(value, ["modelId", "region", "dimensions", "indexVersion"]);
  return {
    modelId: parseDescriptor(value.modelId, "modelId", 128),
    region: parseDescriptor(value.region, "region", 64),
    dimensions: parseRank(value.dimensions, "dimensions"),
    indexVersion: parseDescriptor(value.indexVersion, "indexVersion", 128),
  };
}

function assertRecord(value: unknown, allowedKeys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("expected record");
  const keys = Object.keys(value);
  if (keys.length !== allowedKeys.length || keys.some((key) => !allowedKeys.includes(key))) {
    throw new TypeError("unexpected or missing input key");
  }
}

function parseId(value: unknown, name: string): string {
  if (typeof value !== "string" || !ID.test(value)) throw new TypeError(`${name} must be a bounded opaque ID`);
  return value;
}

function parseDescriptor(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength || !DESCRIPTOR.test(value)) {
    throw new TypeError(`${name} must be a bounded opaque descriptor`);
  }
  return value;
}

function parseRank(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 100_000) {
    throw new TypeError(`${name} must be a bounded positive integer`);
  }
  return value;
}

function parseBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${name} must be boolean`);
  return value;
}

function parseFactStatus(value: unknown): FactStatus {
  if (typeof value !== "string" || !FACT_STATUSES.has(value as FactStatus)) throw new TypeError("invalid fact status");
  return value as FactStatus;
}

function parseTimestamp(value: unknown, name: string): Date {
  if (typeof value !== "string") throw new TypeError(`${name} must be an RFC3339 timestamp`);
  const match = RFC3339_TIMESTAMP.exec(value);
  if (!match) throw new TypeError(`${name} must be an RFC3339 timestamp`);
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const offsetHour = Number(match[9] ?? 0);
  const offsetMinute = Number(match[10] ?? 0);
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    offsetHour > 23 ||
    offsetMinute > 59 ||
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day ||
    calendar.getUTCHours() !== hour ||
    calendar.getUTCMinutes() !== minute ||
    calendar.getUTCSeconds() !== second
  ) {
    throw new TypeError(`${name} must be a valid RFC3339 timestamp`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new TypeError(`${name} must be a valid timestamp`);
  return parsed;
}

function compareId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
