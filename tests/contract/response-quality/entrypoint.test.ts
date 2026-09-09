import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fixturePairingReport, ownedFixtureInput, fixtureFeedback } from "../../../evals/harness/response-quality/fixtures.ts";
import { qualityReport, type ReviewState } from "../../../evals/harness/response-quality/index.ts";

const cli = resolve("evals/harness/response-quality/cli.ts");
test("existing pairing JSON -> bilingual blind package -> fixture feedback import -> same-version JSON/Markdown", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "vpj72-owned-")); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const committed = JSON.parse(execFileSync("git", ["show", "HEAD:artifacts/VPJ-70/results.json"], { encoding: "utf8" }));
  const pairing = committed.reports.unchanged; const owned = ownedFixtureInput(pairing);
  writeFileSync(join(directory, "pairing.json"), JSON.stringify({ reports: { unchanged: pairing } }));
  writeFileSync(join(directory, "samples.json"), JSON.stringify(owned.manifest));
  const prepared = join(directory, "prepared"); const imported = join(directory, "imported");
  const run = (...args: string[]) => execFileSync(process.execPath, ["--experimental-strip-types", cli, ...args], { encoding: "utf8" });
  assert.match(run("prepare", join(directory, "pairing.json"), join(directory, "samples.json"), prepared), /offline report written/);
  const state = JSON.parse(readFileSync(join(prepared, "state.json"), "utf8")) as ReviewState;
  assert.equal(qualityReport(state).counts.semanticNotRun, 20);
  const review = JSON.parse(readFileSync(join(prepared, "review.json"), "utf8"));
  assert.equal(review.presentations.length, 20);
  assert.deepEqual([...new Set(review.presentations.map((p: { language: string }) => p.language))].sort(), ["en", "zh"]);
  assert.doesNotMatch(readFileSync(join(prepared, "review.md"), "utf8"), /owned-en|owned-zh|h01-baseline|h01-unchanged/);
  const feedback = fixtureFeedback(state.bundle, owned.labels);
  writeFileSync(join(directory, "feedback.json"), JSON.stringify([...feedback, ...feedback]));
  run("import", join(prepared, "state.json"), join(directory, "feedback.json"), imported, "fixture");
  const result = JSON.parse(readFileSync(join(imported, "results.json"), "utf8"));
  assert.equal(result.counts.fixtureFeedback, 20); assert.equal(result.counts.humanDeclaredFeedback, 0);
  assert.ok(result.rows.every((r: { parentRow: { repeat: number; configuration: string } }) => r.parentRow.repeat === 1 && r.parentRow.configuration !== "unknown"));
  assert.ok(result.rows.filter((r: { language: string }) => r.language === "zh").every((r: { parentRow: { runId: string | null }; sourcePairingVerdict: string }) => r.parentRow.runId === null && r.sourcePairingVerdict === "NOT_RUN"));
  assert.equal(result.humanCalibration, "UNRUN"); assert.equal(result.adoption, "UNRUN");
  assert.equal(result.rows.filter((r: { verdict: string }) => r.verdict === "FAIL").length, 10);
  assert.ok(result.comparisons.some((c: { preference: string }) => c.preference === "tie"));
  assert.ok(result.comparisons.some((c: { hardGate: string }) => c.hardGate === "both_fail"));
  assert.match(readFileSync(join(imported, "summary.md"), "utf8"), new RegExp(result.bundleHash));
  run("import", join(imported, "state.json"), join(directory, "feedback.json"), imported, "fixture");
  assert.equal(JSON.parse(readFileSync(join(imported, "results.json"), "utf8")).counts.fixtureFeedback, 20);
  const retained = readFileSync(join(imported, "state.json"), "utf8");
  const reprepare = spawnSync(process.execPath, ["--experimental-strip-types", cli, "prepare", join(directory, "pairing.json"), join(directory, "samples.json"), imported], { encoding: "utf8" });
  assert.equal(reprepare.status, 1); assert.match(reprepare.stderr, /OUTPUT_ALREADY_EXISTS/);
  writeFileSync(join(directory, "empty-feedback.json"), "[]");
  const stale = spawnSync(process.execPath, ["--experimental-strip-types", cli, "import", join(prepared, "state.json"), join(directory, "empty-feedback.json"), imported, "fixture"], { encoding: "utf8" });
  assert.equal(stale.status, 1); assert.match(stale.stderr, /EXISTING_FEEDBACK_WOULD_BE_LOST/);
  assert.equal(readFileSync(join(imported, "state.json"), "utf8"), retained);
});

test("CLI rejects incorrect case/version/source without publishing a replacement report", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "vpj72-reject-")); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const pairing = fixturePairingReport(); const owned = ownedFixtureInput(pairing);
  writeFileSync(join(directory, "pairing.json"), JSON.stringify(pairing)); writeFileSync(join(directory, "samples.json"), JSON.stringify(owned.manifest));
  const out = join(directory, "out");
  execFileSync(process.execPath, ["--experimental-strip-types", cli, "prepare", join(directory, "pairing.json"), join(directory, "samples.json"), out]);
  const state = JSON.parse(readFileSync(join(out, "state.json"), "utf8")) as ReviewState;
  const before = readFileSync(join(out, "results.json"), "utf8");
  for (const patch of [{ caseId: "H02" }, { rubricVersion: "wrong" }, { source: { kind: "human", recordRef: "synthetic-wrong-source", method: "manual-local", attribution: "operator-declared" } }]) {
    writeFileSync(join(directory, "invalid.json"), JSON.stringify([{ ...fixtureFeedback(state.bundle, owned.labels)[0], ...patch }]));
    const attempt = spawnSync(process.execPath, ["--experimental-strip-types", cli, "import", join(out, "state.json"), join(directory, "invalid.json"), out, "fixture"], { encoding: "utf8" });
    assert.equal(attempt.status, 1); assert.doesNotMatch(attempt.stderr, /synthetic-wrong-source/);
    assert.equal(readFileSync(join(out, "results.json"), "utf8"), before);
  }
});
