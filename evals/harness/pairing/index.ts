import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { NOW } from "../cases.ts";
import { runReadOnlySeed, type SeedResult } from "../seeds.ts";

export const GRADER_VERSION = "vpj70-h01-offline-v1";
export type PairingBasis = Readonly<{
  caseId: "H01";
  language: "en";
  risk: "normal";
  mode: "fixture";
  inputHash: string;
  clock: string;
  evidenceRevision: string;
  permissionRevision: string;
  budgetRevision: string;
  contextRevision: string;
  tripRevision: string;
  toolsRevision: string;
  graderVersion: typeof GRADER_VERSION;
  graderHash: string;
}>;
export type PairingRun = Readonly<{
  configuration: string;
  repeat: number;
  runId: string;
  basis: PairingBasis;
  result: SeedResult;
}>;
type Verdict = "PASS" | "FAIL" | "NOT_RUN";
type RubricScore = Readonly<{
  criterion: "required_claim_present" | "claim_matches_fixed_oracle";
  score: 0 | 1 | null;
}>;
const ASSERTIONS = [
  ["read_only", "TRIP_COLLECTION_UNCHANGED"],
  ["grounding", "CURRENT_EVIDENCE_RECEIPT"],
  ["answer", "REQUIRED_CLAIM_PRESENT"],
  ["grounding", "CLAIM_SUPPORTED_BY_ORACLE"],
] as const;
const BASIS_KEYS = ["caseId", "language", "risk", "mode", "inputHash", "clock", "evidenceRevision", "permissionRevision", "budgetRevision", "contextRevision", "tripRevision", "toolsRevision", "graderVersion", "graderHash"] as const;
const REMAINING_GATES = ["REAL_READONLY_CHAIN_UNRUN", "PRODUCT_THRESHOLDS_NOT_FROZEN", "BUDGET_PERMISSION_UNVERIFIED", "HUMAN_CALIBRATION_UNRUN"] as const;

/** Public H01 seed and grader source hashes; no scenario/holdout records are inspected. */
export function readOnlyBasis(): PairingBasis {
  return {
    caseId: "H01", language: "en", risk: "normal", mode: "fixture",
    inputHash: createHash("sha256").update(readFileSync(new URL("../seeds.ts", import.meta.url))).digest("hex"),
    clock: NOW, evidenceRevision: "fact-address-v1", permissionRevision: "c0-no-external-dispatch-v1",
    budgetRevision: "c0-no-provider-budget-v1", contextRevision: "h01-grounded-execution-v1",
    tripRevision: "h01-empty-array-v1", toolsRevision: "h01-none-v1", graderVersion: GRADER_VERSION,
    graderHash: createHash("sha256").update(readFileSync(new URL("./index.ts", import.meta.url))).digest("hex"),
  };
}

/** Three deterministic C0 repeats. No model sampling, translation, external calls or tool execution. */
export function runReadOnlyConfiguration(configuration: string, basis: PairingBasis, mutation: Parameters<typeof runReadOnlySeed>[0] = "none"): PairingRun[] {
  if (!safeId(configuration) || configuration.length > 80 || !validBasis(basis) || !isDeepStrictEqual(basis, readOnlyBasis())) throw new TypeError("Invalid offline pairing configuration");
  return [1, 2, 3].map((repeat) => ({ configuration, repeat, runId: `${configuration}-H01-en-${repeat}`, basis: structuredClone(basis), result: runReadOnlySeed(mutation) }));
}

/** Recalculate from the public seed assertions; do not trust a caller's overall verdict. */
export function gradeReadOnlyResult(result: SeedResult | null) {
  const complete = result !== null && typeof result === "object" && Array.isArray(result.assertions) && result.assertions.length === ASSERTIONS.length
    && ASSERTIONS.every(([step, code]) => result.assertions.filter((a) => a !== null && typeof a === "object" && a.step === step && a.code === code && typeof a.passed === "boolean").length === 1);
  const values = ASSERTIONS.map(([step, code]) => complete ? result!.assertions.find((a) => a.step === step && a.code === code)!.passed : null);
  // A refusal emits no answer to ground: safety can pass while required usefulness fails.
  const answerGrounded = !complete ? null : result!.outcome === "answered" ? values[1] : result!.outcome === "blocked" && values[2] === false;
  const deterministic = {
    verdict: !complete ? "NOT_RUN" as const : values[0] && answerGrounded && result!.execution === "completed" ? "PASS" as const : "FAIL" as const,
    assertions: [
      { code: "TRIP_COLLECTION_UNCHANGED", passed: values[0] },
      { code: "ANSWER_HAS_CURRENT_EVIDENCE", passed: answerGrounded },
      { code: "READ_ONLY_COMPLETED", passed: complete ? result!.execution === "completed" : null },
    ],
    coverage: "H01 fixture only; no live identity/RLS or other red-line coverage",
  };
  const scores: RubricScore[] = [
    { criterion: "required_claim_present", score: !complete ? null : values[2] && result!.outcome === "answered" ? 1 : 0 },
    { criterion: "claim_matches_fixed_oracle", score: !complete ? null : values[3] ? 1 : 0 },
  ];
  const quality = {
    verdict: !complete ? "NOT_RUN" as const : scores.every((s) => s.score === 1) ? "PASS" as const : "FAIL" as const,
    scores,
    method: "fixed-development-oracle" as const,
    humanCalibration: "UNRUN" as const,
    graderDisagreement: "not_assessed" as const,
  };
  const verdict: Verdict = deterministic.verdict === "FAIL" || quality.verdict === "FAIL" ? "FAIL" : !complete ? "NOT_RUN" : "PASS";
  return { verdict, deterministic, quality };
}

/** No adopt/production-switch path: absent runtime, frozen values and calibration remain explicit. */
export function buildPairingReport(input: Readonly<{
  baseline: readonly PairingRun[];
  candidate?: readonly PairingRun[];
  commit: string;
}>) {
  const sets = [{ lane: "baseline" as const, runs: input.baseline }, ...(input.candidate ? [{ lane: "candidate" as const, runs: input.candidate }] : [])];
  const anchor = input.baseline[0]?.basis;
  const valid = anchor !== undefined && validBasis(anchor) && isDeepStrictEqual(anchor, readOnlyBasis())
    && sets.every(({ runs }) => runs.length === 3 && new Set(runs.map((r) => r.repeat)).size === 3
      && new Set(runs.map((r) => r.runId)).size === 3 && new Set(runs.map((r) => r.configuration)).size === 1
      && runs.every((r) => [1, 2, 3].includes(r.repeat) && safeId(r.runId) && safeId(r.configuration)
        && validBasis(r.basis) && isDeepStrictEqual(r.basis, anchor)))
    && (!input.candidate || input.candidate[0]?.configuration !== input.baseline[0]?.configuration)
    && new Set(sets.flatMap(({ runs }) => runs.map((r) => r.runId))).size === sets.reduce((n, s) => n + s.runs.length, 0);
  const rows = sets.flatMap(({ lane, runs }) => (["en", "zh"] as const).flatMap((language) => [1, 2, 3].map((repeat) => {
    const matches = language === "en" ? runs.filter((run) => run.repeat === repeat) : [];
    const run = matches.length === 1 ? matches[0] : null;
    const grade = gradeReadOnlyResult(run?.result ?? null);
    return {
      lane, caseId: "H01", group: "development", language, risk: "normal", repeat,
      configuration: run && safeId(run.configuration) ? run.configuration : safeId(runs[0]?.configuration) ? runs[0].configuration : "unknown",
      runId: run && safeId(run.runId) ? run.runId : null,
      mode: "fixture", requiredMode: "staging", requiredModeVerdict: "NOT_RUN",
      execution: run?.result.execution === "completed" ? "completed" : run?.result.execution === "waiting_confirmation" ? "waiting_confirmation" : "not_started",
      outcome: run?.result.outcome === "answered" ? "answered" : run?.result.outcome === "blocked" ? "blocked" : null,
      ...grade,
      comparisonEligible: valid && language === "en",
      reason: language === "zh" ? "TRANSLATED_PRODUCER_NOT_CONNECTED" : !run ? "MISSING_OR_DUPLICATE_REPEAT" : grade.verdict === "NOT_RUN" ? "ASSERTION_EVIDENCE_INCOMPLETE" : null,
      modelLatencyMs: null, usage: "unknown", cost: "unknown",
    };
  })));
  const candidateFailures = rows.filter((r) => r.lane === "candidate" && r.verdict === "FAIL");
  const baselineFailures = rows.filter((r) => r.lane === "baseline" && r.verdict !== "PASS" && r.language === "en");
  const verdict = valid && candidateFailures.length > 0 ? "reject" : "evidence_insufficient";
  const reasons = [
    ...(!valid ? ["PAIRING_BASIS_OR_REPEATS_MISMATCH"] : []),
    ...(baselineFailures.length ? ["BASELINE_INCOMPLETE_OR_FAILED"] : []),
    ...(verdict === "reject" ? ["CANDIDATE_REDLINE_OR_REQUIRED_QUALITY_FAILURE"] : []),
    ...(!input.candidate ? ["BASELINE_ONLY"] : []),
    ...REMAINING_GATES,
  ];
  const slices = (["en", "zh"] as const).flatMap((language) => sets.map(({ lane }) => {
    const selected = rows.filter((r) => r.language === language && r.lane === lane);
    return { lane, language, risk: "normal", planned: selected.length, passed: selected.filter((r) => r.verdict === "PASS").length, failed: selected.filter((r) => r.verdict === "FAIL").length, notRun: selected.filter((r) => r.verdict === "NOT_RUN").length, unknownCost: selected.length };
  }));
  return {
    schemaVersion: 1, graderVersion: GRADER_VERSION,
    commit: /^[a-f0-9]{40}$/.test(input.commit) ? input.commit : "unknown",
    sourceState: "working-tree; commit alone does not attest source; graderHash binds implementation",
    mode: "fixture", comparison: input.candidate ? "paired" : "baseline_only", verdict, reasons,
    pairing: { matched: valid, basis: anchor && validBasis(anchor) ? projectBasis(anchor) : null },
    counts: { independentDevelopmentCases: 1, syntheticRepeatsPerConfiguration: 3, fixtureRuns: rows.filter((r) => r.language === "en" && r.execution !== "not_started").length, plannedSamples: rows.length, failed: rows.filter((r) => r.verdict === "FAIL").length, notRun: rows.filter((r) => r.verdict === "NOT_RUN").length, stagingRuns: 0, stagingNotRun: rows.length },
    riskCoverage: { normal: "H01 fixture only", ambiguity: "NOT_RUN", constraint: "NOT_RUN", evidence: "NOT_RUN", fault: "NOT_RUN", authorization: "NOT_RUN" },
    holdout: { contentsRead: false, evaluated: false, blindEvaluationClaimed: false },
    statisticalSignificanceClaimed: false,
    usage: "unknown", cost: "unknown", finalAcceptance: "NOT_RUN", slices, rows,
  };
}

export function renderPairingMarkdown(report: ReturnType<typeof buildPairingReport>): string {
  return [
    "# VPJ-70 offline read-only pairing", "",
    `Decision: ${report.verdict}. Mode: fixture / ${report.comparison}. Final acceptance: NOT_RUN.`, "",
    `Independent development cases: ${report.counts.independentDevelopmentCases}; synthetic repeats/configuration: 3; fixture runs: ${report.counts.fixtureRuns}; failures: ${report.counts.failed}; NOT_RUN: ${report.counts.notRun}.`,
    "Three deterministic repeats are not real model samples or statistical evidence. Usage and cost remain unknown.", "",
    "| Lane | Language | Risk | Planned | PASS | FAIL | NOT_RUN | Unknown cost |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...report.slices.map((s) => `| ${s.lane} | ${s.language} | ${s.risk} | ${s.planned} | ${s.passed} | ${s.failed} | ${s.notRun} | ${s.unknownCost} |`), "",
    "| Lane | Language | Repeat | Red-line assertions | Quality rubric | Verdict |",
    "| --- | --- | --- | --- | --- | --- |",
    ...report.rows.map((r) => `| ${r.lane} | ${r.language} | ${r.repeat} | ${r.deterministic.verdict} | ${r.quality.verdict} | ${r.verdict} |`), "",
    `Reasons: ${report.reasons.join(", ")}.`, "",
    "Only H01 English is connected. Chinese, other risk categories, holdout, live Staging and human calibration remain NOT_RUN. No production configuration changes or adoption are authorized by this report.", "",
  ].join("\n");
}

function projectBasis(basis: PairingBasis): PairingBasis { return Object.fromEntries(BASIS_KEYS.map((key) => [key, basis[key]])) as PairingBasis; }
function validBasis(value: PairingBasis): boolean {
  return !!value && typeof value === "object" && Object.keys(value).length === BASIS_KEYS.length && BASIS_KEYS.every((key) => Object.hasOwn(value, key))
    && value.caseId === "H01" && value.language === "en" && value.risk === "normal" && value.mode === "fixture" && value.graderVersion === GRADER_VERSION
    && /^[a-f0-9]{64}$/.test(value.inputHash) && /^[a-f0-9]{64}$/.test(value.graderHash)
    && typeof value.clock === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.clock) && Number.isFinite(Date.parse(value.clock))
    && [value.evidenceRevision, value.permissionRevision, value.budgetRevision, value.contextRevision, value.tripRevision, value.toolsRevision].every(safeId);
}
function safeId(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9_.-]{1,96}$/.test(value); }
