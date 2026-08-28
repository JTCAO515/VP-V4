import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const modulePath = fileURLToPath(new URL("./ai-42-corpus.ts", import.meta.url));

test("AI-42 freezes all nine named red-line suites before reporting corpus coverage", async () => {
  assert.equal(existsSync(modulePath), true, "AI-42 corpus registry module must exist");
  const { RED_LINE_SUITES } = await import("./ai-42-corpus.ts");

  assert.deepEqual(RED_LINE_SUITES.map((suite) => suite.id), [
    "RL-01", "RL-02", "RL-03", "RL-04", "RL-05", "RL-06", "RL-07", "RL-08", "RL-09",
  ]);
  assert.deepEqual(Object.fromEntries(RED_LINE_SUITES.map((suite) => [suite.id, suite.fixtureCount])), {
    "RL-01": 2,
    "RL-02": 3,
    "RL-03": 2,
    "RL-04": 3,
    "RL-05": 2,
    "RL-06": 2,
    "RL-07": 2,
    "RL-08": 3,
    "RL-09": 2,
  });
  assert.ok(RED_LINE_SUITES.every((suite) => suite.fixtureCount > 0 && suite.runtimeInvariant.length > 0));
  assert.ok(Object.isFrozen(RED_LINE_SUITES));
});

test("AI-42 reports five-locale, six-moment C0 coverage while keeping holdout out of tuning", async () => {
  const { C0_HOLDOUT_FIXTURES, C0_TUNING_FIXTURES, buildCorpusCoverageReport } = await import("./ai-42-corpus.ts");
  const report = buildCorpusCoverageReport(C0_TUNING_FIXTURES, C0_HOLDOUT_FIXTURES);

  assert.deepEqual(report.locales, ["zh", "en", "es", "ru", "ar"]);
  assert.equal(report.executionMoments.length, 6);
  assert.equal(report.queryModes.length, 5);
  assert.deepEqual(report.riskStrata, ["low", "standard", "high"]);
  assert.equal(report.overlapIds.length, 0);
  assert.equal(report.tuning.kind, "synthetic_c0_tuning");
  assert.equal(report.holdout.kind, "synthetic_c0_holdout");
  assert.equal(report.qualityMetrics, null);
});

test("AI-42 fails closed when a full-size corpus duplicates one stratum and omits another", async () => {
  const { C0_HOLDOUT_FIXTURES, C0_TUNING_FIXTURES, buildCorpusCoverageReport } = await import("./ai-42-corpus.ts");
  const malformed = C0_TUNING_FIXTURES.map((fixture, index) => index === 0
    ? { ...fixture, id: "tuning-repeated-stratum", locale: C0_TUNING_FIXTURES[1].locale, executionMoment: C0_TUNING_FIXTURES[1].executionMoment, queryMode: C0_TUNING_FIXTURES[1].queryMode, risk: C0_TUNING_FIXTURES[1].risk }
    : fixture);

  assert.throws(() => buildCorpusCoverageReport(malformed, C0_HOLDOUT_FIXTURES), TypeError);
});
