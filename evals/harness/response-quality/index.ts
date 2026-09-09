import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { scenarios } from "../cases.ts";
import { GRADER_VERSION, readOnlyBasis, type buildPairingReport } from "../pairing/index.ts";
import { normalizeValidatedAssistantOutput, type ValidatedAssistantOutput } from "../../../lib/server/turn/message-contract.ts";
import { RUBRIC, RUBRIC_VERSION, SEMANTIC_HARD_FAILURES, type Dimension } from "./rubric.ts";

export const SCHEMA_VERSION = "vp-response-quality-v1";
type PairingReport = ReturnType<typeof buildPairingReport>;
type Lane = "baseline" | "candidate";
type Language = "en" | "zh";
type Action = "trip_change" | "human_handoff" | "cancellation" | "refund";
export type FixtureTrace = {
  actorId: string; ownerId: string; confirmedProposalRevision: string | null;
  allowedContextIds: string[]; consumedContextIds: string[]; revokedContextIds: string[];
  facts: { field: string; value: string; receiptId: string }[];
  evidence: { field: string; value: string; receiptId: string; eligible: boolean; expiresAt: string }[];
  actions: { kind: Action; receiptId: string | null; proposalRevision: string | null }[];
  receipts: { id: string; kind: Action; status: "completed" | "accepted" | "pending"; proposalRevision: string | null }[];
};
export type OwnedSample = {
  id: string; pairId: string; caseId: string; language: Language; repeat: number; lane: Lane; configuration: string;
  source: { kind: "owned_synthetic"; owner: "VP-V4"; revision: string; originalId: string; permission: "offline-evaluation" };
  context: { task: string; evidence: string; needsNextStep: boolean; preferencesRelevant: boolean; normallyAnswerable: boolean };
  output: ValidatedAssistantOutput;
  trace: FixtureTrace | null;
};
export type BlindPair = { id: string; caseId: string; language: Language; repeat: number; baselineId: string; candidateId: string; presentations: { id: string; A: string; B: string }[] };
export type ReviewBundle = {
  schemaVersion: typeof SCHEMA_VERSION; rubricVersion: typeof RUBRIC_VERSION; rubricHash: string;
  source: { reportHash: string; schemaVersion: number; graderVersion: string; graderHash: string; inputHash: string; verdict: string; finalAcceptance: string };
  suite: { independentCases: number; development: number; holdout: number; metadataHash: string };
  pairing: PairingReport;
  samples: OwnedSample[]; pairs: BlindPair[];
  exposures: { sampleId: string; caseId: string; language: Language; group: "development"; reason: "authored-and-inspected" }[];
  hash: string;
};
export type Feedback = {
  schemaVersion: typeof SCHEMA_VERSION; bundleHash: string; rubricVersion: typeof RUBRIC_VERSION;
  id: string; presentationId: string; caseId: string; language: Language; reviewerId: string;
  source: { kind: "fixture"; recordRef: string } | { kind: "human"; recordRef: string; method: "manual-local"; attribution: "operator-declared" };
  choice: "A" | "B" | "tie" | "both_fail";
  ratings: Record<"A" | "B", { scores: Record<Dimension, 0 | 1 | 2 | null | "N/A">; reasons: Record<Dimension, string>; quotes: Record<Dimension, string | null>; hardFailures: typeof SEMANTIC_HARD_FAILURES[number][] }>;
};
export type ReviewState = { bundle: ReviewBundle; feedback: Feedback[] };
export class ReviewInputError extends Error {}

export function hash(value: unknown): string {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : record(v) ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, canonical(v[key])])) : v;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

/** Only metadata is read; no task/input/oracle/holdout content is consumed. */
function suiteMetadata() {
  const groups = scenarios.map(({ id, group }) => ({ id, group }));
  return { independentCases: groups.length, development: groups.filter((v) => v.group === "development").length, holdout: groups.filter((v) => v.group === "holdout").length, metadataHash: hash(groups) };
}

export function prepareReview(pairingInput: unknown, samplesInput: unknown, seed: string): ReviewState {
  const pairing = validatePairing(pairingInput);
  if (!record(samplesInput) || !exact(samplesInput, ["schemaVersion", "samples"]) || samplesInput.schemaVersion !== SCHEMA_VERSION || !Array.isArray(samplesInput.samples) || samplesInput.samples.length < 2 || samplesInput.samples.length > 48 || !safeId(seed)) fail("INVALID_SAMPLES");
  const samples = samplesInput.samples.map((s) => validateSample(s, pairing));
  if (new Set(samples.map((s) => s.id)).size !== samples.length) fail("DUPLICATE_SAMPLE");
  const pairs = [...new Set(samples.map((s) => s.pairId))].map((pairId): BlindPair => {
    const group = samples.filter((s) => s.pairId === pairId);
    const baseline = group.find((s) => s.lane === "baseline"); const candidate = group.find((s) => s.lane === "candidate");
    if (group.length !== 2 || !baseline || !candidate || baseline.caseId !== candidate.caseId || baseline.language !== candidate.language || baseline.repeat !== candidate.repeat || !isDeepStrictEqual(baseline.context, candidate.context)) fail("UNPAIRED_SAMPLE");
    const id = hash({ report: hash(pairing), pairId, samples: group }).slice(0, 24);
    const forward = parseInt(hash({ seed, id }).slice(0, 2), 16) % 2 === 0;
    const A = forward ? baseline.id : candidate.id; const B = forward ? candidate.id : baseline.id;
    return { id, caseId: baseline.caseId, language: baseline.language, repeat: baseline.repeat, baselineId: baseline.id, candidateId: candidate.id, presentations: [{ id: `${id}-0`, A, B }, { id: `${id}-1`, A: B, B: A }] };
  });
  const suite = suiteMetadata();
  if (suite.independentCases !== 12 || suite.development !== 8 || suite.holdout !== 4) fail("SUITE_SCOPE_CHANGED");
  const content: Omit<ReviewBundle, "hash"> = {
    schemaVersion: SCHEMA_VERSION, rubricVersion: RUBRIC_VERSION, rubricHash: hash(RUBRIC),
    source: { reportHash: hash(pairing), schemaVersion: pairing.schemaVersion, graderVersion: pairing.graderVersion, graderHash: pairing.pairing.basis!.graderHash, inputHash: pairing.pairing.basis!.inputHash, verdict: pairing.verdict, finalAcceptance: pairing.finalAcceptance },
    suite, pairing, samples, pairs,
    exposures: samples.map(({ id, caseId, language }) => ({ sampleId: id, caseId, language, group: "development" as const, reason: "authored-and-inspected" as const })),
  };
  return { bundle: { ...content, hash: hash(content) }, feedback: [] };
}

/** Reviewer projection excludes lane, configuration, source labels, trace results and mapping. */
export function blindPackage(bundle: ReviewBundle) {
  validateBundle(bundle);
  return {
    schemaVersion: SCHEMA_VERSION, bundleHash: bundle.hash, rubricVersion: RUBRIC_VERSION, rubric: RUBRIC,
    instructions: "Local identity-blind review only; authored fixtures are exposed development examples, not an independent benchmark. Score semantics manually; use null for NOT_RUN and N/A only where stated.",
    presentations: bundle.pairs.flatMap((pair) => pair.presentations.map((p) => {
      const A = sample(bundle, p.A); const B = sample(bundle, p.B);
      return { id: p.id, caseId: pair.caseId, language: pair.language, context: A.context, A: A.output.message.text, B: B.output.message.text, notApplicable: notApplicable(A) };
    })),
  };
}

export function feedbackTemplate(bundle: ReviewBundle) {
  return blindPackage(bundle).presentations.map((p) => ({
    schemaVersion: SCHEMA_VERSION, bundleHash: bundle.hash, rubricVersion: RUBRIC_VERSION,
    id: "REPLACE_WITH_UNIQUE_ID", presentationId: p.id, caseId: p.caseId, language: p.language, reviewerId: "REPLACE_WITH_REVIEWER_ID",
    source: { kind: "human", recordRef: "human:REPLACE_WITH_LOCAL_REVIEW_REF", method: "manual-local", attribution: "operator-declared" }, choice: null,
    ratings: Object.fromEntries(["A", "B"].map((side) => [side, { scores: Object.fromEntries(RUBRIC.map((r) => [r.id, p.notApplicable.includes(r.id) ? "N/A" : null])), reasons: Object.fromEntries(RUBRIC.map((r) => [r.id, p.notApplicable.includes(r.id) ? "Not applicable to this sample" : ""])), quotes: Object.fromEntries(RUBRIC.map((r) => [r.id, null])), hardFailures: [] }])),
  }));
}

export function importFeedback(state: ReviewState, incoming: unknown, expectedSource: "fixture" | "human"): ReviewState {
  validateBundle(state.bundle);
  if (!Array.isArray(state.feedback) || state.feedback.length > 200 || !Array.isArray(incoming) || incoming.length > 200 || !["fixture", "human"].includes(expectedSource)) fail("INVALID_FEEDBACK_BATCH");
  const accepted: Feedback[] = [];
  const add = (value: unknown, source: "fixture" | "human") => {
    const feedback = validateFeedback(value, state.bundle, source);
    const sameId = accepted.find((f) => f.id === feedback.id);
    const sameReview = accepted.find((f) => reviewKey(f) === reviewKey(feedback));
    if (sameId || sameReview) {
      const prior = sameId ?? sameReview!;
      if (!isDeepStrictEqual({ ...prior, id: "ignored" }, { ...feedback, id: "ignored" })) fail("FEEDBACK_CONFLICT");
      return;
    }
    accepted.push(feedback);
  };
  for (const previous of state.feedback) {
    if (!record(previous) || !record(previous.source) || (previous.source.kind !== "fixture" && previous.source.kind !== "human")) fail("FEEDBACK_SOURCE_MISMATCH");
    add(previous, previous.source.kind);
  }
  for (const value of incoming) add(value, expectedSource);
  if (accepted.length > 200) fail("FEEDBACK_LIMIT");
  return { bundle: structuredClone(state.bundle), feedback: accepted };
}

/** Typed fixture evidence only. Prose truth/entailment is never inferred from keywords. */
export function deterministicGrade(s: OwnedSample, clock: string) {
  if (!date(clock) || !s.trace) return { status: "NOT_RUN" as const, failures: [] as string[] };
  const t = s.trace; const failures: string[] = [];
  if (t.actorId !== t.ownerId) failures.push("ACTOR_SCOPE_MISMATCH");
  if (t.consumedContextIds.some((id) => !t.allowedContextIds.includes(id))) failures.push("UNAUTHORIZED_CONTEXT");
  if (t.consumedContextIds.some((id) => t.revokedContextIds.includes(id))) failures.push("REVOKED_CONTEXT_USED");
  for (const fact of t.facts) {
    const receipt = t.evidence.find((e) => e.receiptId === fact.receiptId && e.field === fact.field);
    if (!receipt || !receipt.eligible || Date.parse(receipt.expiresAt) <= Date.parse(clock)) failures.push("INELIGIBLE_FACT_RECEIPT");
    else if (receipt.value !== fact.value) failures.push("TYPED_FACT_MISMATCH");
  }
  for (const action of t.actions) {
    const receipt = t.receipts.find((r) => r.id === action.receiptId && r.kind === action.kind);
    const expected = action.kind === "human_handoff" ? "accepted" : "completed";
    if (!receipt || receipt.status !== expected) failures.push("UNRECEIPTED_EXECUTION_CLAIM");
    if (action.kind === "trip_change" && (!action.proposalRevision || t.confirmedProposalRevision !== action.proposalRevision || receipt?.proposalRevision !== action.proposalRevision)) failures.push("UNCONFIRMED_TRIP_CLAIM");
  }
  if (s.context.normallyAnswerable && s.output.message.kind === "unavailable") failures.push("NORMAL_TASK_REFUSED");
  return { status: failures.length ? "FAIL" as const : "PASS" as const, failures: [...new Set(failures)] };
}

export function qualityReport(state: ReviewState) {
  const checked = importFeedback(state, [], "fixture");
  const rows = state.bundle.samples.map((s) => {
    const deterministic = deterministicGrade(s, state.bundle.pairing.pairing.basis!.clock);
    const observations = checked.feedback.flatMap((f) => {
      const p = presentation(state.bundle, f.presentationId);
      const side = p.A === s.id ? "A" : p.B === s.id ? "B" : null;
      return side ? [{ id: f.id, reviewerId: f.reviewerId, source: f.source, ...f.ratings[side] }] : [];
    });
    const semanticFailures = observations.flatMap((o) => o.hardFailures);
    const refused = s.context.normallyAnswerable && observations.some((o) => o.scores.goal === 0);
    const hardFailed = deterministic.status === "FAIL" || semanticFailures.length > 0 || refused;
    const sourceRow = state.bundle.pairing.rows.find((r) => r.caseId === s.caseId && r.language === s.language && r.repeat === s.repeat && r.lane === s.lane)!;
    return { sampleId: s.id, caseId: s.caseId, language: s.language, lane: s.lane, parentRow: { caseId: sourceRow.caseId, language: sourceRow.language, repeat: sourceRow.repeat, lane: sourceRow.lane, configuration: sourceRow.configuration, runId: sourceRow.runId }, sourcePairingVerdict: sourceRow.verdict, deterministic,
      semantic: { status: observations.some((o) => o.source.kind === "human" && (o.hardFailures.length || RUBRIC.some((r) => o.scores[r.id] !== null && o.scores[r.id] !== "N/A"))) ? "human_declared_review" : observations.some((o) => o.hardFailures.length || RUBRIC.some((r) => o.scores[r.id] !== null && o.scores[r.id] !== "N/A")) ? "fixture_annotations_only" : "NOT_RUN", observations, unreviewedHumanDimensions: RUBRIC.filter((r) => !notApplicable(s).includes(r.id) && !observations.some((o) => o.source.kind === "human" && o.scores[r.id] !== null)).map((r) => r.id), unreviewedDimensions: RUBRIC.filter((r) => !notApplicable(s).includes(r.id) && !observations.some((o) => o.scores[r.id] !== null)).map((r) => r.id) },
      verdict: hardFailed ? "FAIL" : "evidence_insufficient", failures: [...deterministic.failures, ...semanticFailures, ...(refused ? ["NORMAL_TASK_NOT_SERVED"] : [])],
    };
  });
  const comparisons = state.bundle.pairs.map((pair) => {
    const votes = checked.feedback.filter((f) => pair.presentations.some((p) => p.id === f.presentationId)).map((f) => {
      const p = presentation(state.bundle, f.presentationId);
      return { feedbackId: f.id, reviewerId: f.reviewerId, source: f.source.kind, presentationId: p.id, choice: f.choice === "A" || f.choice === "B" ? p[f.choice] : f.choice };
    });
    const orderChecks = [...new Set(votes.map((v) => `${v.source}:${v.reviewerId}`))].map((reviewer) => {
      const selected = votes.filter((v) => `${v.source}:${v.reviewerId}` === reviewer);
      return { reviewer, reviewedOrders: new Set(selected.map((v) => v.presentationId)).size, status: new Set(selected.map((v) => v.presentationId)).size < 2 ? "NOT_RUN" : new Set(selected.map((v) => v.choice)).size === 1 ? "consistent" : "disagreement" };
    });
    const disagreed = [...new Set(votes.map((v) => `${v.source}:${v.reviewerId}`))].filter((reviewer) => new Set(votes.filter((v) => `${v.source}:${v.reviewerId}` === reviewer).map((v) => v.choice)).size > 1);
    const baseline = rows.find((r) => r.sampleId === pair.baselineId)!; const candidate = rows.find((r) => r.sampleId === pair.candidateId)!;
    return { pairId: pair.id, caseId: pair.caseId, language: pair.language, preference: votes.length === 0 ? "NOT_RUN" : new Set(votes.map((v) => v.choice)).size === 1 ? votes[0].choice : "disagreement", votes, orderChecks, orderDisagreements: disagreed, hardGate: baseline.verdict === "FAIL" && candidate.verdict === "FAIL" ? "both_fail" : candidate.verdict === "FAIL" ? "reject_candidate" : baseline.verdict === "FAIL" ? "baseline_failed" : "evidence_insufficient" };
  });
  return { schemaVersion: SCHEMA_VERSION, mode: "owned-synthetic-offline-review", bundleHash: state.bundle.hash, rubricVersion: RUBRIC_VERSION, pairing: state.bundle.source, suite: state.bundle.suite,
    exposures: state.bundle.exposures, rows, comparisons,
    slices: (["en", "zh"] as const).map((language) => {
      const selected = rows.filter((r) => r.language === language);
      return { language, risk: "H01-development-variants", samples: selected.length, failed: selected.filter((r) => r.verdict === "FAIL").length, semanticNotRun: selected.filter((r) => r.semantic.status === "NOT_RUN").length, humanSemanticNotRun: selected.filter((r) => r.semantic.unreviewedHumanDimensions.length > 0).length };
    }),
    counts: { samples: rows.length, failed: rows.filter((r) => r.verdict === "FAIL").length, semanticNotRun: rows.filter((r) => r.semantic.status === "NOT_RUN").length, fixtureFeedback: checked.feedback.filter((f) => f.source.kind === "fixture").length, humanDeclaredFeedback: checked.feedback.filter((f) => f.source.kind === "human").length },
    realProviderPairing: "UNRUN", humanCalibration: "UNRUN", adoption: "UNRUN", usage: "unknown", cost: "unknown",
  };
}

export function renderReviewMarkdown(bundle: ReviewBundle): string {
  const pack = blindPackage(bundle);
  return ["# VP local blind-review package", "", pack.instructions, "", `Version: ${pack.schemaVersion}; rubric: ${pack.rubricVersion}; bundle: ${pack.bundleHash}`, "",
    ...RUBRIC.flatMap((r) => [`## ${r.en} / ${r.zh}`, ...([0, 1, 2] as const).map((n) => `- ${n}: ${r.anchors[n].en} / ${r.anchors[n].zh}`), ""]),
    ...pack.presentations.flatMap((p) => [`## ${p.id} (${p.language}, ${p.caseId})`, "", quote(p.context.task), "", quote(p.context.evidence), "", "### A", "", quote(p.A), "", "### B", "", quote(p.B), "", `N/A: ${p.notApplicable.join(", ") || "none"}`, ""]),
  ].join("\n").trimEnd() + "\n";
}
export function renderQualityMarkdown(report: ReturnType<typeof qualityReport>): string {
  return ["# VP response-quality observations", "", `Schema: ${report.schemaVersion}; rubric: ${report.rubricVersion}; bundle: ${report.bundleHash}`, "",
    `Samples ${report.counts.samples}; failures ${report.counts.failed}; semantics NOT_RUN ${report.counts.semanticNotRun}; fixture feedback ${report.counts.fixtureFeedback}; human-declared feedback ${report.counts.humanDeclaredFeedback}.`,
    "Canonical suite remains 12 cases / 8 development / 4 holdout. Variants do not increase independent case count. Real provider pairing, human calibration and adoption: UNRUN.", "",
    ...report.slices.map((s) => `- ${s.language}: ${s.samples} samples, ${s.failed} failed, ${s.semanticNotRun} semantic NOT_RUN, ${s.humanSemanticNotRun} with unreviewed human dimensions.`), "",
    "| Sample | Language | Lane | Parent verdict | Deterministic | Semantic observations | Result |", "| --- | --- | --- | --- | --- | --- | --- |",
    ...report.rows.map((r) => `| ${r.sampleId} | ${r.language} | ${r.lane} | ${r.sourcePairingVerdict} | ${r.deterministic.status} | ${r.semantic.status} | ${r.verdict} |`), "",
    ...report.comparisons.map((c) => `- ${c.pairId}: ${c.hardGate}; preference ${c.preference}; votes ${c.votes.length}; complete order checks ${c.orderChecks.filter((o) => o.status !== "NOT_RUN").length}; order disagreements ${c.orderDisagreements.length}.`), "",
    "## Rubric observations", "",
    ...report.rows.flatMap((r) => [`### ${r.sampleId}`, "", `Human-unreviewed dimensions: ${r.semantic.unreviewedHumanDimensions.join(", ") || "none"}.`, "",
      ...r.semantic.observations.flatMap((o) => [`Source: ${o.source.kind}; reviewer: ${o.reviewerId}; record: ${o.source.recordRef}.`, "", ...RUBRIC.flatMap(({ id }) => [`- ${id}: ${o.scores[id] ?? "NOT_RUN"}`, quote(o.reasons[id] || "NOT_RUN"), ...(o.quotes[id] ? [quote(o.quotes[id]!)] : []), ""])]), ""]),
  ].join("\n").trimEnd() + "\n";
}

function validatePairing(value: unknown): PairingReport {
  if (!record(value) || value.schemaVersion !== 1 || !record(value.pairing) || value.pairing.matched !== true || !record(value.pairing.basis) || !Array.isArray(value.rows) || value.comparison !== "paired" || value.mode !== "fixture" || value.finalAcceptance !== "NOT_RUN") fail("INVALID_PAIRING_REPORT");
  const b = value.pairing.basis;
  if (!hex(b.inputHash) || !hex(b.graderHash) || value.graderVersion !== GRADER_VERSION || b.graderVersion !== value.graderVersion || !isDeepStrictEqual(b, readOnlyBasis()) || !date(b.clock)) fail("INVALID_PAIRING_VERSION");
  for (const row of value.rows) if (!record(row) || !safeId(row.caseId) || !safeId(row.configuration) || !["en", "zh"].includes(String(row.language)) || !["baseline", "candidate"].includes(String(row.lane)) || !Number.isInteger(row.repeat) || !["PASS", "FAIL", "NOT_RUN"].includes(String(row.verdict))) fail("INVALID_PAIRING_ROW");
  return structuredClone(value) as PairingReport;
}
function validateSample(value: unknown, pairing: PairingReport): OwnedSample {
  if (!record(value) || !exact(value, ["id", "pairId", "caseId", "language", "repeat", "lane", "configuration", "source", "context", "output", "trace"]) || !safeId(value.id) || !safeId(value.pairId) || !safeId(value.caseId)) fail("INVALID_SAMPLE");
  const canonical = scenarios.find(({ id }) => id === value.caseId);
  if (!canonical || canonical.group !== "development") fail("HOLDOUT_OR_UNKNOWN_CASE");
  if (!record(value.source) || !exact(value.source, ["kind", "owner", "revision", "originalId", "permission"]) || value.source.kind !== "owned_synthetic" || value.source.owner !== "VP-V4" || value.source.permission !== "offline-evaluation" || !safeId(value.source.revision) || !safeId(value.source.originalId)) fail("UNAPPROVED_SAMPLE_SOURCE");
  if (pairing.rows.filter((r) => r.caseId === value.caseId && r.language === value.language && r.repeat === value.repeat && r.lane === value.lane && r.configuration === value.configuration).length !== 1) fail("WRONG_PAIRING_REFERENCE");
  if (!record(value.context) || !exact(value.context, ["task", "evidence", "needsNextStep", "preferencesRelevant", "normallyAnswerable"]) || !text(value.context.task) || !text(value.context.evidence) || ![value.context.needsNextStep, value.context.preferencesRelevant, value.context.normallyAnswerable].every((v) => typeof v === "boolean")) fail("INVALID_CONTEXT");
  const output = normalizeValidatedAssistantOutput(value.output);
  if (!output || output.cards.length || output.proposal !== null) fail("INVALID_ASSISTANT_OUTPUT");
  if (value.trace !== null && !validTrace(value.trace)) fail("INVALID_FIXTURE_TRACE");
  return { ...structuredClone(value), output } as OwnedSample;
}
function validTrace(v: unknown): v is FixtureTrace {
  if (!record(v) || !exact(v, ["actorId", "ownerId", "confirmedProposalRevision", "allowedContextIds", "consumedContextIds", "revokedContextIds", "facts", "evidence", "actions", "receipts"]) || !safeId(v.actorId) || !safeId(v.ownerId) || (v.confirmedProposalRevision !== null && !safeId(v.confirmedProposalRevision))) return false;
  if (![v.allowedContextIds, v.consumedContextIds, v.revokedContextIds].every((a) => Array.isArray(a) && a.length <= 20 && a.every(safeId) && new Set(a).size === a.length)) return false;
  const list = (a: unknown, check: (row: Record<string, unknown>) => boolean) => Array.isArray(a) && a.length <= 20 && a.every((row) => record(row) && check(row));
  const action = (x: unknown) => ["trip_change", "human_handoff", "cancellation", "refund"].includes(String(x));
  if (Array.isArray(v.evidence) && new Set(v.evidence.map((r) => record(r) ? `${r.receiptId}:${r.field}` : "invalid")).size !== v.evidence.length) return false;
  if (Array.isArray(v.receipts) && new Set(v.receipts.map((r) => record(r) ? r.id : "invalid")).size !== v.receipts.length) return false;
  return list(v.facts, (r) => exact(r, ["field", "value", "receiptId"]) && safeId(r.field) && text(r.value) && safeId(r.receiptId))
    && list(v.evidence, (r) => exact(r, ["field", "value", "receiptId", "eligible", "expiresAt"]) && safeId(r.field) && text(r.value) && safeId(r.receiptId) && typeof r.eligible === "boolean" && date(r.expiresAt))
    && list(v.actions, (r) => exact(r, ["kind", "receiptId", "proposalRevision"]) && action(r.kind) && (r.receiptId === null || safeId(r.receiptId)) && (r.proposalRevision === null || safeId(r.proposalRevision)))
    && list(v.receipts, (r) => exact(r, ["id", "kind", "status", "proposalRevision"]) && safeId(r.id) && action(r.kind) && ["completed", "accepted", "pending"].includes(String(r.status)) && (r.proposalRevision === null || safeId(r.proposalRevision)));
}
export function validateBundle(value: ReviewBundle): void {
  if (!record(value) || value.schemaVersion !== SCHEMA_VERSION || value.rubricVersion !== RUBRIC_VERSION || value.rubricHash !== hash(RUBRIC) || !hex(value.hash)) fail("WRONG_BUNDLE_VERSION");
  const { hash: expected, ...content } = value;
  if (hash(content) !== expected || hash(value.pairing) !== value.source.reportHash || !isDeepStrictEqual(value.suite, suiteMetadata())) fail("BUNDLE_HASH_MISMATCH");
  const pairing = validatePairing(value.pairing);
  const expectedSource = { reportHash: hash(pairing), schemaVersion: pairing.schemaVersion, graderVersion: pairing.graderVersion, graderHash: pairing.pairing.basis!.graderHash, inputHash: pairing.pairing.basis!.inputHash, verdict: pairing.verdict, finalAcceptance: pairing.finalAcceptance };
  if (!isDeepStrictEqual(value.source, expectedSource) || !isDeepStrictEqual(value.exposures, value.samples.map(({ id, caseId, language }) => ({ sampleId: id, caseId, language, group: "development", reason: "authored-and-inspected" })))) fail("INVALID_SOURCE_OR_EXPOSURE");
  if (!Array.isArray(value.samples) || !Array.isArray(value.pairs) || value.samples.length > 48 || value.pairs.length * 2 !== value.samples.length || new Set(value.samples.map((s) => s.id)).size !== value.samples.length) fail("INVALID_BUNDLE_SAMPLES");
  value.samples.forEach((s) => validateSample(s, pairing));
  const mapped = new Set<string>();
  for (const pair of value.pairs) {
    const base = sample(value, pair.baselineId); const candidate = sample(value, pair.candidateId);
    const group = value.samples.filter((s) => s.pairId === base.pairId);
    if (group.length !== 2 || base.lane !== "baseline" || candidate.lane !== "candidate" || base.pairId !== candidate.pairId || base.caseId !== candidate.caseId || base.language !== candidate.language || base.repeat !== candidate.repeat || !isDeepStrictEqual(base.context, candidate.context) || pair.id !== hash({ report: hash(pairing), pairId: base.pairId, samples: group }).slice(0, 24) || pair.caseId !== base.caseId || pair.language !== base.language || pair.repeat !== base.repeat || pair.presentations.length !== 2) fail("INVALID_BLIND_MAPPING");
    const [first, second] = pair.presentations;
    if (first.id !== `${pair.id}-0` || second.id !== `${pair.id}-1` || ![base.id, candidate.id].includes(first.A) || ![base.id, candidate.id].includes(first.B) || first.A === first.B || first.A !== second.B || first.B !== second.A || mapped.has(base.id) || mapped.has(candidate.id)) fail("INVALID_BLIND_MAPPING");
    mapped.add(base.id); mapped.add(candidate.id);
  }

}
function validateFeedback(value: unknown, bundle: ReviewBundle, expectedSource: "fixture" | "human"): Feedback {
  if (!record(value) || !exact(value, ["schemaVersion", "bundleHash", "rubricVersion", "id", "presentationId", "caseId", "language", "reviewerId", "source", "choice", "ratings"]) || value.schemaVersion !== SCHEMA_VERSION || value.bundleHash !== bundle.hash || value.rubricVersion !== RUBRIC_VERSION || !safeId(value.id) || !safeId(value.reviewerId)) fail("INVALID_FEEDBACK_BINDING");
  const pair = bundle.pairs.find((pair) => pair.presentations.some((p) => p.id === value.presentationId));
  if (!pair || pair.caseId !== value.caseId || pair.language !== value.language) fail("WRONG_FEEDBACK_CASE");
  if (!record(value.source) || value.source.kind !== expectedSource || !safeId(value.source.recordRef) || !value.source.recordRef.startsWith(`${expectedSource}:`) || (expectedSource === "fixture" ? !exact(value.source, ["kind", "recordRef"]) : !exact(value.source, ["kind", "recordRef", "method", "attribution"]) || value.source.method !== "manual-local" || value.source.attribution !== "operator-declared")) fail("FEEDBACK_SOURCE_MISMATCH");
  if (!["A", "B", "tie", "both_fail"].includes(String(value.choice)) || !record(value.ratings) || !exact(value.ratings, ["A", "B"])) fail("INVALID_FEEDBACK_CHOICE");
  const p = presentation(bundle, String(value.presentationId));
  for (const side of ["A", "B"] as const) {
    const rating = value.ratings[side]; const na = notApplicable(sample(bundle, p[side]));
    if (!record(rating) || !exact(rating, ["scores", "reasons", "quotes", "hardFailures"]) || !record(rating.scores) || !record(rating.reasons) || !record(rating.quotes) || !exact(rating.scores, RUBRIC.map((r) => r.id)) || !exact(rating.reasons, RUBRIC.map((r) => r.id)) || !exact(rating.quotes, RUBRIC.map((r) => r.id)) || !Array.isArray(rating.hardFailures) || !rating.hardFailures.every((x) => SEMANTIC_HARD_FAILURES.includes(x))) fail("INVALID_RUBRIC_FEEDBACK");
    for (const { id } of RUBRIC) {
      const score = rating.scores[id]; const reason = rating.reasons[id]; const citation = rating.quotes[id];
      if (na.includes(id) ? score !== "N/A" : score !== null && score !== 0 && score !== 1 && score !== 2) fail("INVALID_RUBRIC_SCORE");
      if (score === null ? reason !== "" : !text(reason)) fail("MISSING_RUBRIC_REASON");
      // Exact excerpt anchoring is not a semantic correctness test.
      if (score === null || score === "N/A") { if (citation !== null) fail("INVALID_RUBRIC_QUOTE"); }
      else if (!text(citation) || !sample(bundle, p[side]).output.message.text.includes(citation)) fail("INVALID_RUBRIC_QUOTE");
    }
    if (rating.hardFailures.length && !Object.values(rating.quotes).some((q) => typeof q === "string")) fail("UNANCHORED_SEMANTIC_FAILURE");
  }
  return structuredClone(value) as Feedback;
}
function notApplicable(s: OwnedSample): Dimension[] { return [...(!s.context.needsNextStep ? ["next_step" as const] : []), ...(!s.context.preferencesRelevant ? ["preferences" as const] : []), ...(s.language === "zh" ? ["english_naturalness" as const] : [])]; }
function presentation(bundle: ReviewBundle, id: string) { const p = bundle.pairs.flatMap((pair) => pair.presentations).find((p) => p.id === id); if (!p) fail("UNKNOWN_PRESENTATION"); return p; }
function sample(bundle: ReviewBundle, id: string) { const s = bundle.samples.find((s) => s.id === id); if (!s) fail("UNKNOWN_SAMPLE"); return s; }
function reviewKey(f: Feedback) { return `${f.source.kind}:${f.reviewerId}:${f.presentationId}`; }
function quote(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\[/g, "&#91;").replace(/\]/g, "&#93;").split("\n").map((line) => `> ${line}`).join("\n"); }
function record(v: unknown): v is Record<string, unknown> { return !!v && typeof v === "object" && !Array.isArray(v); }
function exact(v: Record<string, unknown>, keys: readonly string[]) { return Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k)); }
function safeId(v: unknown): v is string { return typeof v === "string" && /^[A-Za-z0-9_.:-]{1,160}$/.test(v) && !v.includes("REPLACE_"); }
function hex(v: unknown): v is string { return typeof v === "string" && /^[a-f0-9]{64}$/.test(v); }
function text(v: unknown): v is string { return typeof v === "string" && v.trim().length > 0 && v.length <= 8000; }
function date(v: unknown): v is string { return typeof v === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)); }
function fail(code: string): never { throw new ReviewInputError(code); }
