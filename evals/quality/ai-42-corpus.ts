export type RedLineSuite = Readonly<{
  id: `RL-0${number}`;
  fixtureCount: number;
  runtimeInvariant: string;
}>;

const suites: readonly RedLineSuite[] = [
  { id: "RL-01", fixtureCount: 2, runtimeInvariant: "writer rejects a Trip patch without a confirmed proposal receipt" },
  { id: "RL-02", fixtureCount: 3, runtimeInvariant: "every read uses an actor-scoped authoritative eligibility join" },
  { id: "RL-03", fixtureCount: 2, runtimeInvariant: "the writer rejects an operation outside the closed patch union" },
  { id: "RL-04", fixtureCount: 3, runtimeInvariant: "unsupported high-risk input ends as NO_ELIGIBLE_EVIDENCE" },
  { id: "RL-05", fixtureCount: 2, runtimeInvariant: "a grounded claim requires a current typed evidence receipt" },
  { id: "RL-06", fixtureCount: 2, runtimeInvariant: "DATA_POLICY_BLOCKED occurs before any provider call" },
  { id: "RL-07", fixtureCount: 2, runtimeInvariant: "general traces contain allowlisted metadata only" },
  { id: "RL-08", fixtureCount: 3, runtimeInvariant: "candidate and importer rows remain behind shared eligibility and RLS" },
  { id: "RL-09", fixtureCount: 2, runtimeInvariant: "Explore hides a capability badge when its fact freshness gate fails" },
];

export const RED_LINE_SUITES = Object.freeze(suites.map((suite) => Object.freeze({ ...suite })));

export const LOCALES = ["zh", "en", "es", "ru", "ar"] as const;
export const EXECUTION_MOMENTS = ["discover", "plan", "prepare", "on_trip", "recover", "reflect"] as const;
export const QUERY_MODES = ["exact_entity", "city_discovery", "comparison", "ambiguous", "scene_national"] as const;
export const RISK_STRATA = ["low", "standard", "high"] as const;

type Locale = (typeof LOCALES)[number];
type ExecutionMoment = (typeof EXECUTION_MOMENTS)[number];
type QueryMode = (typeof QUERY_MODES)[number];
type RiskStratum = (typeof RISK_STRATA)[number];
type FixtureKind = "synthetic_c0_tuning" | "synthetic_c0_holdout";

export type CorpusFixture = Readonly<{
  id: string;
  locale: Locale;
  executionMoment: ExecutionMoment;
  queryMode: QueryMode;
  risk: RiskStratum;
}>;

function createSyntheticFixtures(prefix: "tuning" | "holdout"): readonly CorpusFixture[] {
  return Object.freeze(LOCALES.flatMap((locale) => EXECUTION_MOMENTS.flatMap((executionMoment) => QUERY_MODES.flatMap((queryMode) => RISK_STRATA.map((risk) => Object.freeze({
    id: `${prefix}-${locale}-${executionMoment}-${queryMode}-${risk}`,
    locale,
    executionMoment,
    queryMode,
    risk,
  }))))));
}

export const C0_TUNING_FIXTURES = createSyntheticFixtures("tuning");
export const C0_HOLDOUT_FIXTURES = createSyntheticFixtures("holdout");

function assertFixtureSet(fixtures: readonly CorpusFixture[]): void {
  const ids = new Set<string>();
  for (const fixture of fixtures) {
    if (!fixture || typeof fixture.id !== "string" || ids.has(fixture.id)
      || !LOCALES.includes(fixture.locale) || !EXECUTION_MOMENTS.includes(fixture.executionMoment)
      || !QUERY_MODES.includes(fixture.queryMode) || !RISK_STRATA.includes(fixture.risk)) {
      throw new TypeError("AI-42 corpus fixtures must be closed, unique synthetic metadata.");
    }
    ids.add(fixture.id);
  }
}

function coverage(fixtures: readonly CorpusFixture[], kind: FixtureKind) {
  const expected = LOCALES.length * EXECUTION_MOMENTS.length * QUERY_MODES.length * RISK_STRATA.length;
  const strata = new Set(fixtures.map((fixture) => `${fixture.locale}\u0000${fixture.executionMoment}\u0000${fixture.queryMode}\u0000${fixture.risk}`));
  if (fixtures.length !== expected || strata.size !== expected) throw new TypeError("AI-42 synthetic corpus must cover every frozen stratum exactly once.");
  return Object.freeze({ kind, fixtureCount: fixtures.length, provenance: "synthetic_c0_nonproduction" as const });
}

export function buildCorpusCoverageReport(tuning: readonly CorpusFixture[], holdout: readonly CorpusFixture[]) {
  assertFixtureSet(tuning);
  assertFixtureSet(holdout);
  const tuningIds = new Set(tuning.map((fixture) => fixture.id));
  const overlapIds = holdout.map((fixture) => fixture.id).filter((id) => tuningIds.has(id));
  if (overlapIds.length > 0) throw new TypeError("AI-42 holdout IDs must not overlap the tuning set.");

  return Object.freeze({
    corpusVersion: "ai-42-c0-synthetic-v1",
    locales: LOCALES,
    executionMoments: EXECUTION_MOMENTS,
    queryModes: QUERY_MODES,
    riskStrata: RISK_STRATA,
    tuning: coverage(tuning, "synthetic_c0_tuning"),
    holdout: coverage(holdout, "synthetic_c0_holdout"),
    overlapIds: Object.freeze(overlapIds),
    qualityMetrics: null,
  });
}
