import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync, copyFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fixturePairingReport, ownedFixtureInput, fixtureFeedback } from "./fixtures.ts";
import type { ReviewState } from "./index.ts";

test("VPJ-72 full owned-fixture offline entrypoint retains failures, NOT_RUN and provenance", (t) => {
  const artifact = resolve("artifacts/VPJ-72"); mkdirSync(artifact, { recursive: true });
  if (existsSync(resolve(artifact, "state.json"))) {
    const previous = JSON.parse(readFileSync(resolve(artifact, "state.json"), "utf8")) as ReviewState;
    assert.ok(previous.feedback.every((f) => f.source.kind === "fixture"), "Never overwrite human feedback with generated fixtures");
  }
  const output = mkdtempSync(join(tmpdir(), "vpj72-artifact-"));
  t.after(() => rmSync(output, { recursive: true, force: true }));
  const pairing = fixturePairingReport(); const owned = ownedFixtureInput(pairing);
  writeFileSync(resolve(output, "pairing-input.json"), JSON.stringify(pairing, null, 2) + "\n");
  writeFileSync(resolve(output, "owned-samples.json"), JSON.stringify(owned.manifest, null, 2) + "\n");
  const cli = resolve("evals/harness/response-quality/cli.ts");
  execFileSync(process.execPath, ["--experimental-strip-types", cli, "prepare", resolve(output, "pairing-input.json"), resolve(output, "owned-samples.json"), output]);
  const state = JSON.parse(readFileSync(resolve(output, "state.json"), "utf8")) as ReviewState;
  writeFileSync(resolve(output, "fixture-feedback.json"), JSON.stringify(fixtureFeedback(state.bundle, owned.labels), null, 2) + "\n");
  execFileSync(process.execPath, ["--experimental-strip-types", cli, "import", resolve(output, "state.json"), resolve(output, "fixture-feedback.json"), output, "fixture"]);
  const result = JSON.parse(readFileSync(resolve(output, "results.json"), "utf8"));
  assert.equal(result.suite.independentCases, 12); assert.equal(result.suite.development, 8); assert.equal(result.suite.holdout, 4);
  assert.equal(result.counts.samples, 20); assert.equal(result.counts.failed, 10);
  assert.equal(result.counts.fixtureFeedback, 20); assert.equal(result.counts.humanDeclaredFeedback, 0);
  assert.equal(result.realProviderPairing, "UNRUN"); assert.equal(result.humanCalibration, "UNRUN"); assert.equal(result.adoption, "UNRUN");
  assert.ok(result.comparisons.some((c: { preference: string }) => c.preference === "tie"));
  assert.ok(result.comparisons.some((c: { hardGate: string }) => c.hardGate === "both_fail"));
  for (const name of readdirSync(output)) copyFileSync(resolve(output, name), resolve(artifact, name));
});
