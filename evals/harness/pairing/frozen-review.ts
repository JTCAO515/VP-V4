import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { buildPairingReport, readOnlyBasis, runReadOnlyConfiguration } from "./index.ts";
import { hash, prepareReview, qualityReport, ReviewInputError, SCHEMA_VERSION, type OwnedSample, type ReviewState } from "../response-quality/index.ts";
import { RUBRIC, RUBRIC_VERSION, type Dimension } from "../response-quality/rubric.ts";

/** Inputs only: never freeze generated facts, consumed context, actions, or answer text. */
export function plannedSample(s: OwnedSample) {
  const { output: _output, trace, ...slot } = s;
  return { ...slot, traceContext: trace ? {
    actorId: trace.actorId, ownerId: trace.ownerId, confirmedProposalRevision: trace.confirmedProposalRevision,
    allowedContextIds: trace.allowedContextIds, revokedContextIds: trace.revokedContextIds,
    evidence: trace.evidence, receipts: trace.receipts,
  } : null };
}
type Slot = ReturnType<typeof plannedSample>;
export type FreezeInput = {
  id: string; commit: string; basis: ReturnType<typeof readOnlyBasis>;
  baselineConfiguration: string; candidateConfiguration: string;
  slots: Slot[];
  budget: { providerCalls: 0; perTaskUsd: 0; batchUsd: 0; modelLatencyMs: null };
  thresholds: { qualityTolerance: number; minimumScore: number; benefit: { dimension: Dimension; minimumGain: number } };
};
function versions() {
  const paths = ["./frozen-review.ts", "../response-quality/index.ts", "../../../lib/server/turn/message-contract.ts"];
  return { rubricVersion: RUBRIC_VERSION, rubricHash: hash(RUBRIC), implementationHash: hash(paths.map((p) => createHash("sha256").update(readFileSync(new URL(p, import.meta.url))).digest("hex"))) };
}
function fail(code: string): never { throw new ReviewInputError(code); }

/** Register before producing candidate outputs. Hashes bind content, not trusted chronology. */
export function freezeReview(input: FreezeInput) {
  if (!input || !/^[A-Za-z0-9_.-]{1,80}$/.test(input.id) || !/^[a-f0-9]{40}$/.test(input.commit)
    || !isDeepStrictEqual(input.basis, readOnlyBasis()) || !Array.isArray(input.slots)) fail("INVALID_FREEZE_INPUT");
  if (!isDeepStrictEqual(input.budget, { providerCalls: 0, perTaskUsd: 0, batchUsd: 0, modelLatencyMs: null })) fail("OFFLINE_BUDGET_REQUIRED");
  const t = input.thresholds;
  if (!t || !Number.isFinite(t.qualityTolerance) || t.qualityTolerance < 0 || t.qualityTolerance > 2
    || !Number.isFinite(t.minimumScore) || t.minimumScore < 0 || t.minimumScore > 2
    || !t.benefit || !RUBRIC.some((r) => r.id === t.benefit.dimension)
    || !Number.isFinite(t.benefit.minimumGain) || t.benefit.minimumGain <= 0 || t.benefit.minimumGain > 2) fail("INVALID_FROZEN_THRESHOLDS");
  if (Object.keys(input).sort().join(",") !== ["id", "commit", "basis", "baselineConfiguration", "candidateConfiguration", "slots", "budget", "thresholds"].sort().join(",")
    || Object.keys(t).sort().join(",") !== "benefit,minimumScore,qualityTolerance"
    || Object.keys(t.benefit).sort().join(",") !== "dimension,minimumGain") fail("INVALID_FREEZE_FIELDS");
  const pairing = buildPairingReport({ baseline: runReadOnlyConfiguration(input.baselineConfiguration, input.basis), candidate: runReadOnlyConfiguration(input.candidateConfiguration, input.basis), commit: input.commit });
  const samples = input.slots.map(({ traceContext, ...slot }) => ({ ...slot,
    output: { schemaVersion: "assistant-output-v1", turnId: `planned-${slot.id}`, message: { kind: "answer", text: "Unproduced offline output." }, cards: [], proposal: null },
    trace: traceContext ? { ...traceContext, facts: [], actions: [], consumedContextIds: [] } : null,
  }));
  const checked = prepareReview(pairing, { schemaVersion: SCHEMA_VERSION, samples }, "frozen-plan-validation");
  if (!isDeepStrictEqual(checked.bundle.samples.map(plannedSample), input.slots)) fail("INVALID_PLANNED_FIELDS");
  // Both lanes receive exactly the same evidence and authority, not just the same prose context.
  for (const pair of checked.bundle.pairs) {
    const a = input.slots.find((s) => s.id === pair.baselineId)!;
    const b = input.slots.find((s) => s.id === pair.candidateId)!;
    if (!isDeepStrictEqual(a.traceContext, b.traceContext)) fail("UNPAIRED_FROZEN_AUTHORITY");
  }
  const groups = new Map<string, Slot[]>();
  for (const slot of input.slots) {
    const key = hash({ language: slot.language, context: slot.context, traceContext: slot.traceContext, lane: slot.lane });
    groups.set(key, [...(groups.get(key) ?? []), slot]);
  }
  if ([...groups.values()].some((slots) => {
    const counts = [1, 2, 3].map((repeat) => slots.filter((s) => s.repeat === repeat).length);
    return counts[0] === 0 || !counts.every((n) => n === counts[0]);
  })) fail("THREE_MATCHED_REPEATS_REQUIRED");
  const content = { schemaVersion: "vpj70-frozen-review-v1" as const, ...versions(), input: structuredClone(input) };
  return { ...content, hash: hash(content) };
}
export type FrozenReview = ReturnType<typeof freezeReview>;

export function evaluateFrozenReview(frozen: FrozenReview, state: ReviewState) {
  if (!isDeepStrictEqual(frozen, freezeReview(frozen.input))) fail("FROZEN_PLAN_CHANGED");
  const quality = qualityReport(state); // Reuses VPJ-72 validation, A/B mapping, provenance and hard gates.
  const input = frozen.input;
  if (state.bundle.pairing.commit !== input.commit || !isDeepStrictEqual(state.bundle.pairing.pairing.basis, input.basis)
    || !isDeepStrictEqual(state.bundle.samples.map(plannedSample), input.slots)) fail("FROZEN_INPUT_MISMATCH");
  const pairs = state.bundle.pairs.map((pair) => {
    const baseline = quality.rows.find((r) => r.sampleId === pair.baselineId)!;
    const candidate = quality.rows.find((r) => r.sampleId === pair.candidateId)!;
    const comparison = quality.comparisons.find((r) => r.pairId === pair.id)!;
    const failures = [...candidate.failures, ...(candidate.sourcePairingVerdict === "FAIL" ? ["PARENT_CANDIDATE_FAILED"] : [])];
    const observations = candidate.semantic.observations.flatMap((c) => {
      const b = baseline.semantic.observations.find((b) => b.id === c.id);
      if (!b) return [];
      return RUBRIC.map(({ id }) => {
        const aScore = b.scores[id]; const bScore = c.scores[id];
        const delta = typeof aScore === "number" && typeof bScore === "number" ? bScore - aScore : null;
        // Normal completion and factual/required claims cannot be traded for tone or density.
        const tolerance = id === "goal" || id === "evidence" ? 0 : input.thresholds.qualityTolerance;
        if (typeof bScore === "number" && bScore < input.thresholds.minimumScore) failures.push(`MINIMUM_SCORE:${id}`);
        if (delta !== null && delta < -tolerance) failures.push(`REGRESSION:${id}`);
        return { feedbackId: c.id, source: c.source, reviewerId: c.reviewerId, dimension: id, baseline: aScore, candidate: bScore, delta };
      });
    });
    const benefits = observations.filter((o) => o.dimension === input.thresholds.benefit.dimension);
    const benefit = benefits.length > 0 && benefits.every((o) => o.delta !== null && o.delta >= input.thresholds.benefit.minimumGain);
    const reasons = [...new Set(failures)];
    return { pairId: pair.id, caseId: pair.caseId, language: pair.language, repeat: pair.repeat,
      baseline, candidate, comparison, observations, benefitObserved: benefit,
      decision: reasons.length ? "reject" : "evidence_insufficient", reasons,
    };
  });
  return { schemaVersion: frozen.schemaVersion, frozenHash: frozen.hash, bundleHash: state.bundle.hash,
    decision: pairs.some((p) => p.decision === "reject") ? "reject" : "evidence_insufficient",
    mode: "owned-synthetic-offline-review", input, pairs,
    slices: quality.slices, parentCounts: state.bundle.pairing.counts,
    reasons: ["REAL_READONLY_CHAIN_UNRUN", "HUMAN_CALIBRATION_UNRUN", "MODEL_LATENCY_AND_USAGE_UNKNOWN", ...(!pairs.every((p) => p.benefitObserved) ? ["DECLARED_BENEFIT_NOT_ESTABLISHED"] : [])],
    humanCalibration: "UNRUN", realProviderPairing: "UNRUN", finalAcceptance: "UNRUN", usage: "unknown", cost: "unknown",
  };
}
export function renderFrozenReview(report: ReturnType<typeof evaluateFrozenReview>) {
  return ["# VPJ-70 frozen review", "", `Decision: ${report.decision}; mode: ${report.mode}; final acceptance: ${report.finalAcceptance}.`,
    `Frozen plan: ${report.frozenHash}; blind bundle: ${report.bundleHash}.`, "",
    "Synthetic development observations only. Human calibration and real provider pairing: UNRUN. Usage/cost unknown. No adoption or statistical claim.", "",
    "| Pair | Language | Repeat | Baseline | Candidate | Decision | Reasons |", "| --- | --- | --- | --- | --- | --- | --- |",
    ...report.pairs.map((p) => `| ${p.pairId} | ${p.language} | ${p.repeat} | ${p.baseline.verdict} | ${p.candidate.verdict} | ${p.decision} | ${p.reasons.join(", ")} |`), "",
    ...report.slices.map((s) => `- ${s.language}: ${s.samples} samples; ${s.failed} hard failures; ${s.humanSemanticNotRun} human-unreviewed samples.`), "",
    `Retained parent denominator: ${report.parentCounts.plannedSamples}; NOT_RUN: ${report.parentCounts.notRun}; Staging NOT_RUN: ${report.parentCounts.stagingNotRun}.`, "",
    ...report.pairs.flatMap((p) => [`## ${p.pairId}`, "", `A/B preference: ${p.comparison.preference}; order disagreements: ${p.comparison.orderDisagreements.length}; declared benefit observed: ${p.benefitObserved}.`, "",
      "| Feedback | Source | Dimension | Baseline | Candidate | Delta |", "| --- | --- | --- | --- | --- | --- |",
      ...p.observations.map((o) => `| ${o.feedbackId} | ${o.source.kind} | ${o.dimension} | ${o.baseline ?? "NOT_RUN"} | ${o.candidate ?? "NOT_RUN"} | ${o.delta ?? "NOT_RUN"} |`), ""]),
    `Remaining: ${report.reasons.join(", ")}.`, "",
  ].join("\n");
}
