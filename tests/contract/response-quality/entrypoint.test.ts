import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
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


test("CLI rejects cumulative state overflow before replacing any existing review file", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "vpj72-state-limit-")); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const pairing = fixturePairingReport(); const owned = ownedFixtureInput(pairing);
  writeFileSync(join(directory, "pairing.json"), JSON.stringify(pairing));
  writeFileSync(join(directory, "samples.json"), JSON.stringify(owned.manifest));
  const out = join(directory, "out");
  const run = (...args: string[]) => spawnSync(process.execPath, ["--experimental-strip-types", cli, ...args], { encoding: "utf8" });
  assert.equal(run("prepare", join(directory, "pairing.json"), join(directory, "samples.json"), out).status, 0);
  const initial = JSON.parse(readFileSync(join(out, "state.json"), "utf8")) as ReviewState;
  const template = fixtureFeedback(initial.bundle, owned.labels);
  const batch = (number: number) => structuredClone(template).map((f, index) => {
    f.id = `review-${number}-${index}`; f.reviewerId = `reviewer-${number}`;
    for (const side of ["A", "B"] as const) {
      for (const key of Object.keys(f.ratings[side].reasons) as Array<keyof typeof f.ratings.A.reasons>) f.ratings[side].reasons[key] = "Permitted anchored explanation. ".repeat(190);
    }
    return f;
  });
  const first = batch(1); const second = batch(2);
  assert.equal(first.length, 20); assert.equal(second.length, 20);
  assert.ok(Buffer.byteLength(JSON.stringify(first)) < 2_000_000);
  assert.ok(Buffer.byteLength(JSON.stringify(second)) < 2_000_000);
  assert.ok(first.every((f) => Object.values(f.ratings.A.reasons).every((reason) => reason.length < 8000)));
  writeFileSync(join(directory, "first.json"), JSON.stringify(first)); writeFileSync(join(directory, "second.json"), JSON.stringify(second));
  assert.equal(run("import", join(out, "state.json"), join(directory, "first.json"), out, "fixture").status, 0);
  const snapshot = new Map(readdirSync(out).map((name) => [name, readFileSync(join(out, name))]));
  assert.ok(snapshot.get("state.json")!.byteLength <= 2_000_000);
  const rejected = run("import", join(out, "state.json"), join(directory, "second.json"), out, "fixture");
  assert.equal(rejected.status, 1); assert.match(rejected.stderr, /STATE_FILE_LIMIT/);
  assert.deepEqual(readdirSync(out).sort(), [...snapshot.keys()].sort());
  for (const [name, bytes] of snapshot) assert.deepEqual(readFileSync(join(out, name)), bytes, `${name} must remain unchanged`);
  const recovery = structuredClone(template[0]); recovery.id = "review-after-rejection"; recovery.reviewerId = "reviewer-after-rejection";
  writeFileSync(join(directory, "recovery.json"), JSON.stringify([recovery]));
  assert.equal(run("import", join(out, "state.json"), join(directory, "recovery.json"), out, "fixture").status, 0);
  const retained = JSON.parse(readFileSync(join(out, "state.json"), "utf8")) as ReviewState;
  assert.equal(retained.feedback.length, 21);
  assert.ok(retained.feedback.every((f) => f.reviewerId !== "reviewer-2"));
});
