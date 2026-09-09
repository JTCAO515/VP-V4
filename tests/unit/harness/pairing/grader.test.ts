import assert from "node:assert/strict";
import test from "node:test";
import { runReadOnlySeed, type SeedResult } from "../../../../evals/harness/seeds.ts";
import { gradeReadOnlyResult, readOnlyBasis, runReadOnlyConfiguration, buildPairingReport } from "../../../../evals/harness/pairing/index.ts";

const commit = "a".repeat(40);
const run = (name: string, mutation: Parameters<typeof runReadOnlySeed>[0] = "none") => runReadOnlyConfiguration(name, readOnlyBasis(), mutation);

test("quality rubric remains separate from deterministic read-only and receipt checks", () => {
  const baseline = gradeReadOnlyResult(runReadOnlySeed());
  assert.equal(baseline.deterministic.verdict, "PASS");
  assert.deepEqual(baseline.quality.scores.map((s) => s.score), [1, 1]);
  assert.equal(baseline.quality.humanCalibration, "UNRUN");
  assert.equal(baseline.quality.graderDisagreement, "not_assessed");
  const unsupported = gradeReadOnlyResult(runReadOnlySeed("unsupported_claim"));
  assert.equal(unsupported.deterministic.verdict, "PASS");
  assert.deepEqual(unsupported.quality.scores.map((s) => s.score), [1, 0]);
  assert.equal(unsupported.verdict, "FAIL");
  const refusal = gradeReadOnlyResult(runReadOnlySeed("blanket_refusal"));
  assert.equal(refusal.deterministic.verdict, "PASS");
  assert.equal(refusal.quality.scores[0].score, 0);
  assert.equal(refusal.verdict, "FAIL");
});

test("one hard failure cannot be offset by perfect quality or a forged seed verdict", () => {
  const candidate = run("candidate");
  candidate[1].result.assertions.find((a) => a.code === "TRIP_COLLECTION_UNCHANGED")!.passed = false;
  candidate[1].result.verdict = "PASS";
  const report = buildPairingReport({ baseline: run("baseline"), candidate, commit });
  assert.equal(report.verdict, "reject");
  const failed = report.rows.find((r) => r.lane === "candidate" && r.repeat === 2 && r.language === "en")!;
  assert.equal(failed.deterministic.verdict, "FAIL");
  assert.equal(failed.quality.verdict, "PASS");
  assert.equal(report.counts.failed, 1);
  assert.equal(report.slices.find((s) => s.lane === "candidate" && s.language === "en")!.failed, 1);
});

test("unsupported claims and excessive refusal reject even with two passing repeats", () => {
  for (const mutation of ["unsupported_claim", "blanket_refusal"] as const) {
    const candidate = run("candidate");
    candidate[2] = { ...candidate[2], result: runReadOnlySeed(mutation) };
    const report = buildPairingReport({ baseline: run("baseline"), candidate, commit });
    assert.equal(report.verdict, "reject");
    assert.equal(report.counts.failed, 1);
  }
});

test("missing or duplicated evidence stays NOT_RUN instead of vacuous PASS", () => {
  const original = runReadOnlySeed();
  const samples: SeedResult[] = [
    { ...original, assertions: [] },
    { ...original, assertions: [...original.assertions.slice(1), original.assertions[1]] },
    { ...original, assertions: [...original.assertions, { step: "extra", code: "extra", passed: true }] },
  ];
  for (const sample of samples) {
    const grade = gradeReadOnlyResult(sample);
    assert.equal(grade.verdict, "NOT_RUN");
    assert.equal(grade.deterministic.verdict, "NOT_RUN");
    assert.deepEqual(grade.quality.scores.map((s) => s.score), [null, null]);
  }
});

test("matching baseline-only and non-degrading pairs cannot bypass missing adoption gates", () => {
  for (const candidate of [undefined, run("candidate")]) {
    const report = buildPairingReport({ baseline: run("baseline"), candidate, commit });
    assert.equal(report.pairing.matched, true);
    assert.equal(report.verdict, "evidence_insufficient");
    assert.ok(report.reasons.includes("PRODUCT_THRESHOLDS_NOT_FROZEN"));
    assert.ok(report.reasons.includes("BUDGET_PERMISSION_UNVERIFIED"));
    assert.ok(report.reasons.includes("HUMAN_CALIBRATION_UNRUN"));
    assert.equal(report.finalAcceptance, "NOT_RUN");
    assert.equal(report.statisticalSignificanceClaimed, false);
    assert.equal(report.counts.independentDevelopmentCases, 1);
  }
});

test("every fixed basis dimension and repeat identity must match", () => {
  for (const key of Object.keys(readOnlyBasis())) {
    const candidate = structuredClone(run("candidate"));
    Reflect.set(candidate[1].basis, key, "changed");
    const report = buildPairingReport({ baseline: run("baseline"), candidate, commit });
    assert.equal(report.pairing.matched, false, key);
    assert.equal(report.verdict, "evidence_insufficient", key);
    assert.ok(report.reasons.includes("PAIRING_BASIS_OR_REPEATS_MISMATCH"));
  }
  const candidates = [run("candidate").slice(0, 2), [run("candidate")[0], run("candidate")[0], run("candidate")[2]], run("baseline")];
  for (const candidate of candidates) assert.equal(buildPairingReport({ baseline: run("baseline"), candidate, commit }).pairing.matched, false);
});

test("producer refuses a caller's fictional clock/evidence binding even if both lanes would match", () => {
  assert.throws(() => runReadOnlyConfiguration("baseline", { ...readOnlyBasis(), clock: "2026-09-01T00:00:00.000Z" }), /Invalid offline pairing/);
});
