import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import test from "node:test";
import { buildPairingReport, readOnlyBasis, renderPairingMarkdown, runReadOnlyConfiguration } from "./index.ts";

const directory = new URL("../../../artifacts/VPJ-70/", import.meta.url);
test("VPJ-70 offline baseline remains insufficient and deliberate read-only regressions reject", () => {
  const basis = readOnlyBasis();
  let commit = "unknown";
  try { commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: new URL("../../../", import.meta.url), encoding: "utf8" }).trim(); } catch { /* Exported trees may lack Git. */ }
  const baseline = runReadOnlyConfiguration("h01-baseline-v1", basis);
  const baselineOnly = buildPairingReport({ baseline, commit });
  const unchanged = buildPairingReport({ baseline, candidate: runReadOnlyConfiguration("h01-unchanged-candidate-v1", basis), commit });
  const unsupported = buildPairingReport({ baseline, candidate: runReadOnlyConfiguration("h01-unsupported-candidate-v1", basis, "unsupported_claim"), commit });
  const refusal = buildPairingReport({ baseline, candidate: runReadOnlyConfiguration("h01-refusal-candidate-v1", basis, "blanket_refusal"), commit });
  assert.equal(baselineOnly.verdict, "evidence_insufficient");
  assert.equal(unchanged.verdict, "evidence_insufficient");
  assert.equal(unsupported.verdict, "reject");
  assert.equal(refusal.verdict, "reject");
  const reports = { baselineOnly, unchanged, unsupported, refusal };
  const uniqueFixtureRuns = new Set(Object.values(reports).flatMap((report) => report.rows.filter((row) => row.runId !== null).map((row) => row.runId))).size;
  assert.equal(uniqueFixtureRuns, 12);
  mkdirSync(directory, { recursive: true });
  writeFileSync(new URL("results.json", directory), JSON.stringify({ schemaVersion: 1, independentDevelopmentCases: 1, uniqueFixtureRuns, syntheticRepetitionsPerConfiguration: 3, uniqueConfigurations: 4, realModelRuns: 0, usage: "unknown", cost: "unknown", preparationVerdict: "PASS", finalAcceptance: "NOT_RUN", reports }, null, 2) + "\n");
  writeFileSync(new URL("summary.md", directory), `# VPJ-70 preparation summary\n\nOne independent development case; ${uniqueFixtureRuns} unique deterministic fixture runs across four configurations. Baseline rows are reused across reports and must not be counted again. Real model runs: 0; usage/cost unknown.\n\n` + Object.entries(reports).map(([name, report]) => `## ${name}\n\n${renderPairingMarkdown(report)}`).join("\n"));
});
