import assert from "node:assert/strict";
import test from "node:test";
import { buildPairingReport, readOnlyBasis, renderPairingMarkdown, runReadOnlyConfiguration } from "../../../../evals/harness/pairing/index.ts";

function report() { const basis = readOnlyBasis(); return buildPairingReport({ baseline: runReadOnlyConfiguration("baseline", basis), candidate: runReadOnlyConfiguration("candidate", basis), commit: "a".repeat(40) }); }

test("JSON and Markdown preserve planned Chinese and live modes as NOT_RUN", () => {
  const value = report();
  assert.equal(value.counts.fixtureRuns, 6);
  assert.equal(value.counts.plannedSamples, 12);
  assert.equal(value.counts.notRun, 6);
  assert.equal(value.counts.stagingRuns, 0);
  assert.equal(value.counts.stagingNotRun, 12);
  assert.equal(value.slices.filter((s) => s.language === "zh").every((s) => s.planned === 3 && s.notRun === 3), true);
  assert.equal(value.rows.every((r) => r.cost === "unknown" && r.usage === "unknown" && r.modelLatencyMs === null), true);
  assert.equal(value.riskCoverage.authorization, "NOT_RUN");
  assert.equal(value.holdout.evaluated, false);
  const markdown = renderPairingMarkdown(value);
  assert.match(markdown, /evidence_insufficient/);
  assert.match(markdown, /\| candidate \| zh \| normal \| 3 \| 0 \| 0 \| 3 \| 3 \|/);
  assert.match(markdown, /Three deterministic repeats are not real model samples/);
});

test("report projection drops arbitrary payloads, raw assertions and untrusted metadata", () => {
  const baseline = runReadOnlyConfiguration("baseline", readOnlyBasis());
  Reflect.set(baseline[0].result, "rawPrompt", "synthetic-private-payload");
  Reflect.set(baseline[0], "authorization", "synthetic-private-header");
  const value = buildPairingReport({ baseline, commit: "synthetic-private-commit" });
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /synthetic-private/);
  assert.equal(value.commit, "unknown");
  assert.equal(value.verdict, "evidence_insufficient");
  assert.doesNotMatch(renderPairingMarkdown(value), /synthetic-private/);
});
