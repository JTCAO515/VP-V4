import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { scenarios, versions } from "./cases.ts";
import { gradeTripTrace, runAmbiguitySeed, runReadOnlySeed, runTripSeed, tripSeedTrace } from "./seeds.ts";

const outputDirectory = new URL("../../artifacts/VPJ-66/", import.meta.url);

test("12 independent specifications preserve the 8/4 stratified split", () => {
  assert.equal(new Set(scenarios.map((value) => value.id)).size, 12);
  assert.deepEqual(Object.fromEntries(["normal", "ambiguity", "constraint", "evidence", "fault", "authorization"].map((category) => [category, scenarios.filter((value) => value.category === category).length])), { normal: 3, ambiguity: 1, constraint: 2, evidence: 2, fault: 2, authorization: 2 });
  for (const [group, count] of [["development", 8], ["holdout", 4]] as const) {
    const cases = scenarios.filter((value) => value.group === group);
    assert.equal(cases.length, count);
    assert.ok(cases.some((value) => value.category === "normal"));
    assert.ok(cases.some((value) => value.allowed.includes("blocked") || value.allowed.includes("clarification")));
  }
  assert.ok(scenarios.filter((value) => value.seed).every((value) => value.group === "development"));
  for (const value of scenarios) assert.ok(value.input && value.prerequisite && value.oracle && value.forbidden.length && value.requiredMode === "staging");
});

test("offline seeds report passing baselines and localized detected faults separately", () => {
  const started = performance.now();
  const measure = (run: () => ReturnType<typeof runTripSeed>) => {
    const start = performance.now();
    const result = run();
    return { result, elapsedMs: Math.round((performance.now() - start) * 1000) / 1000 };
  };
  // Keyed by case ID (not array position) so seeds can be added for any
  // scenario without renumbering the ones that already run.
  const seedRunners: Record<string, () => ReturnType<typeof runTripSeed>> = { H01: () => runReadOnlySeed(), H02: () => runTripSeed(), H04: () => runAmbiguitySeed() };
  const baselineByCase = Object.fromEntries(Object.entries(seedRunners).map(([caseId, run]) => [caseId, measure(run)]));
  const mutations = [
    { id: "H01-unsupported", caseId: "H01", expectedStep: "grounding", expectedCode: "CLAIM_SUPPORTED_BY_ORACLE", ...measure(() => runReadOnlySeed("unsupported_claim")) },
    { id: "H01-refusal", caseId: "H01", expectedStep: "answer", expectedCode: "REQUIRED_CLAIM_PRESENT", ...measure(() => runReadOnlySeed("blanket_refusal")) },
    { id: "H02-dinner", caseId: "H02", expectedStep: "candidate", expectedCode: "DINNER_LOCK_PRESERVED", ...measure(() => runTripSeed("dinner_changed")) },
    { id: "H02-unconfirmed", caseId: "H02", expectedStep: "confirmation", expectedCode: "NO_UNCONFIRMED_WRITE", ...measure(() => runTripSeed("unconfirmed_write")) },
    // H04 (VPJ-67): a caller that assumes a single gallery without disambiguation
    // must be caught -- the ambiguity oracle requires NO_ELIGIBLE_EVIDENCE, not a guess.
    { id: "H04-single-candidate-assumed", caseId: "H04", expectedStep: "answer", expectedCode: "NO_SINGLE_SUBJECT_SELECTED", ...measure(() => runAmbiguitySeed("single_candidate_assumed")) },
  ];
  // Explicit projection: no environment, prompts, claims, private payloads or arbitrary trace objects enter reports.
  const rows = scenarios.map((scenario) => {
    const baseline = scenario.seed ? baselineByCase[scenario.id] : undefined;
    return { caseId: scenario.id, runId: `offline-v1-${scenario.id}`, taskId: `synthetic-task-${scenario.id}`, attemptId: scenario.seed ? `synthetic-attempt-${scenario.id}-1` : null, group: scenario.group, category: scenario.category, language: scenario.language, mode: "fixture", requiredMode: scenario.requiredMode, requiredModeVerdict: "NOT_RUN", owner: scenario.owner, clock: scenario.clock, tripVersion: scenario.tripVersion, execution: baseline ? baseline.result.execution : "not_started", outcome: baseline ? baseline.result.outcome : null, verdict: baseline ? baseline.result.verdict : "NOT_RUN", assertions: baseline ? baseline.result.assertions : [], reasonCode: baseline ? null : "INTEGRATION_NOT_CONNECTED", elapsedMs: baseline ? baseline.elapsedMs : null, usage: "unknown", cost: "unknown" };
  });
  let commit = "unknown";
  try { commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: new URL("../../", import.meta.url), encoding: "utf8" }).trim(); } catch { /* An exported source tree has no commit. */ }
  const baselineResults = Object.values(baselineByCase);
  const report = { schemaVersion: 1, versions, commit, sourceState: "working-tree; commit alone does not attest uncommitted source", mode: "fixture", holdout: { status: "specified-not-executed", promptTuningUsed: false, blindModelEvaluationClaimed: false }, counts: { independentCases: 12, languages: ["en"], fixtureBaselineRuns: baselineResults.length, mutationRuns: mutations.length, fixtureNotRun: 12 - baselineResults.length, stagingRuns: 0, stagingNotRun: 12 }, elapsedMs: Math.round((performance.now() - started) * 1000) / 1000, usage: "unknown", cost: "unknown", providerCalls: 0, realTripWrites: 0, userQuotaDebits: 0, rows, mutations, preparationVerdict: baselineResults.every((value) => value.result.verdict === "PASS") && mutations.every((value) => value.result.verdict === "FAIL" && value.result.assertions.some((item) => !item.passed && item.step === value.expectedStep && item.code === value.expectedCode)) ? "PASS" : "FAIL", finalAcceptance: "NOT_RUN" };
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(new URL("results.json", outputDirectory), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(new URL("summary.md", outputDirectory), `# VPJ-66/VPJ-67 离线运行摘要\n\n准备判定：${report.preparationVerdict}。模式：fixture；语言：en。\n\n12个独立案例：正常种子${baselineResults.length}次（H01/H02 归 VPJ-66，H04 归 VPJ-67），故障注入${mutations.length}次；其余${12 - baselineResults.length}例NOT_RUN。真实Staging 0次，12例全部NOT_RUN。\n\n${rows.map((row) => `- ${row.caseId}: ${row.verdict}; ${row.execution}; ${row.outcome ?? "unknown"}; ${row.owner}`).join("\n")}\n\n故障预期FAIL：${mutations.map((value) => `${value.id}=${value.result.verdict} (${value.expectedStep}/${value.expectedCode})`).join("；")}。\n\n费用与usage未知；不声称真实步行、身份、确认或持久化验收。详情见 results.json、docs/harness/OFFLINE-SEEDS.md 与 docs/harness/VPJ-67-READONLY-SEEDS.md。\n`);
  assert.equal(report.preparationVerdict, "PASS");
  assert.equal(report.finalAcceptance, "NOT_RUN");
});

test("grader catches sidecar, revision, scope, route-basis and reload violations", () => {
  const faults = [
    (trace: ReturnType<typeof tripSeedTrace>) => {
      // A shared producer bug must not pass merely because candidate/final/reload agree.
      const wrong = { ...trace.final, days: trace.final.days.map((day) => ({ ...day, items: day.items?.map((item) => item.id === "afternoon" ? { ...item, startsAt: "2026-09-11T17:00:00+08:00", endsAt: "2026-09-11T19:00:00+08:00" } : item) })) };
      trace.candidate = wrong; trace.final = wrong; trace.reloaded = wrong; trace.diff = { ...trace.diff, next: wrong };
    },
    (trace: ReturnType<typeof tripSeedTrace>) => { trace.finalSidecar.receiptId = "wrong-receipt"; },
    (trace: ReturnType<typeof tripSeedTrace>) => { trace.candidateSidecar.placeId = "wrong-place"; },
    (trace: ReturnType<typeof tripSeedTrace>) => { trace.confirmedRevision = "fixture-proposal-r0"; },
    (trace: ReturnType<typeof tripSeedTrace>) => { trace.confirmedBase = 6; },
    (trace: ReturnType<typeof tripSeedTrace>) => { trace.routeAfter.source = "incomparable-route"; },
    (trace: ReturnType<typeof tripSeedTrace>) => { trace.routeAfter.walkingMinutes = 40; },
    (trace: ReturnType<typeof tripSeedTrace>) => { trace.reloaded = { ...trace.final, version: 7 }; },
    (trace: ReturnType<typeof tripSeedTrace>) => { trace.rejected = trace.final; },
    (trace: ReturnType<typeof tripSeedTrace>) => { trace.final = { ...trace.final, title: "Unrequested title" }; },
  ];
  for (const fault of faults) {
    const trace = tripSeedTrace();
    fault(trace);
    assert.equal(gradeTripTrace(trace).verdict, "FAIL");
  }
});
