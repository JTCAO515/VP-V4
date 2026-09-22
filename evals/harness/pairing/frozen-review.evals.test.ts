import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fixturePairingReport, ownedFixtureInput, fixtureFeedback } from "../response-quality/fixtures.ts";
import { importFeedback, prepareReview } from "../response-quality/index.ts";
import { freezeReview, evaluateFrozenReview, plannedSample, renderFrozenReview, type FreezeInput } from "./frozen-review.ts";

function setup() {
  const pairing = fixturePairingReport();
  const owned = ownedFixtureInput(pairing);
  // One unchanged bilingual development variant; three repeats remain distinct slots.
  owned.manifest.samples = owned.manifest.samples.filter((s) => s.pairId.endsWith("-tie")).flatMap((s) => [1, 2, 3].map((repeat) => ({ ...structuredClone(s), repeat, id: `${s.id}-${repeat}`, pairId: `${s.pairId}-${repeat}`, source: { ...s.source, originalId: `${s.id}-${repeat}` } })));
  for (const s of owned.manifest.samples) owned.labels[s.id] = owned.labels[s.id.replace(/-[123]$/, "")];
  const input: FreezeInput = { id: "test-freeze-v1", commit: pairing.commit, basis: pairing.pairing.basis!, baselineConfiguration: "h01-baseline-v1", candidateConfiguration: "h01-unchanged-candidate-v1", slots: owned.manifest.samples.map(plannedSample), budget: { providerCalls: 0, perTaskUsd: 0, batchUsd: 0, modelLatencyMs: null }, thresholds: { qualityTolerance: 1, minimumScore: 1, benefit: { dimension: "density", minimumGain: 1 } } };
  const frozen = freezeReview(input); // Happens before review or annotations.
  const state = prepareReview(pairing, owned.manifest, "test-seed");
  const feedback = fixtureFeedback(state.bundle, owned.labels);
  return { input, frozen, state, feedback, owned, pairing };
}

test("frozen unchanged pairs retain all repeats, unknown costs and human UNRUN", () => {
  const { frozen, state, feedback } = setup();
  const report = evaluateFrozenReview(frozen, importFeedback(state, feedback, "fixture"));
  assert.equal(report.decision, "evidence_insufficient"); assert.equal(report.pairs.length, 6);
  assert.equal(report.parentCounts.stagingNotRun, 12); assert.equal(report.humanCalibration, "UNRUN");
  assert.equal(report.cost, "unknown"); assert.ok(report.reasons.includes("DECLARED_BENEFIT_NOT_ESTABLISHED"));
  assert.match(renderFrozenReview(report), /Staging NOT_RUN: 12/);
});

test("one degraded candidate among good repeats is rejected without averaging", () => {
  const { frozen, state, feedback } = setup();
  const p = state.bundle.pairs[0].presentations[0];
  const side = state.bundle.samples.find((s) => s.id === p.A)!.lane === "candidate" ? "A" : "B";
  feedback[0].ratings[side].hardFailures = ["unsupported_claim"];
  const report = evaluateFrozenReview(frozen, importFeedback(state, feedback, "fixture"));
  assert.equal(report.decision, "reject"); assert.equal(report.pairs.filter((p) => p.decision === "reject").length, 1);
});

test("required goal/evidence regression ignores the quality tolerance; other minima apply", () => {
  for (const dimension of ["goal", "evidence", "tone"] as const) {
    const { frozen, state, feedback } = setup();
    const p = state.bundle.pairs[0].presentations[0];
    const side = state.bundle.samples.find((s) => s.id === p.A)!.lane === "candidate" ? "A" : "B";
    feedback[0].ratings[side].scores[dimension] = dimension === "tone" ? 0 : 1;
    const report = evaluateFrozenReview(frozen, importFeedback(state, feedback, "fixture"));
    assert.equal(report.decision, "reject");
    assert.ok(report.pairs[0].reasons.some((r) => r.endsWith(`:${dimension}`)));
  }
});

test("actual output mutation is allowed but typed false facts and over-refusal reject", () => {
  for (const mutation of ["fact", "refusal"] as const) {
    const { frozen, owned, pairing } = setup();
    const s = owned.manifest.samples.find((s) => s.lane === "candidate")!;
    if (mutation === "fact") s.trace!.facts[0].value = "Invented address";
    else s.output = { ...s.output, message: { ...s.output.message, kind: "unavailable" } };
    const state = prepareReview(pairing, owned.manifest, "mutated-output");
    assert.equal(evaluateFrozenReview(frozen, state).decision, "reject");
  }
});

test("changed budget, basis, configuration, frozen thresholds or slot scope cannot silently compare", () => {
  const { frozen, state, input } = setup();
  const tampered = structuredClone(frozen); tampered.input.thresholds.minimumScore = 0;
  assert.throws(() => evaluateFrozenReview(tampered, state), /FROZEN_PLAN_CHANGED/);
  const badBudget = structuredClone(input); Object.assign(badBudget.budget, { providerCalls: 1 });
  assert.throws(() => freezeReview(badBudget), /OFFLINE_BUDGET_REQUIRED/);
  const nan = structuredClone(input); nan.thresholds.minimumScore = NaN;
  assert.throws(() => freezeReview(nan), /INVALID_FROZEN_THRESHOLDS/);
  const clock = structuredClone(input); clock.basis = { ...clock.basis, clock: "2026-09-22T00:00:00.000Z" };
  assert.throws(() => freezeReview(clock), /INVALID_FREEZE_INPUT/);
  const authority = structuredClone(input); authority.slots[3].traceContext!.allowedContextIds = ["other"];
  assert.throws(() => freezeReview(authority), /UNPAIRED_FROZEN_AUTHORITY/);
  const fewer = structuredClone(input); fewer.slots = fewer.slots.filter((s) => s.repeat !== 3);
  assert.throws(() => freezeReview(fewer), /THREE_MATCHED_REPEATS_REQUIRED/);
});

test("regenerated valid bundle with changed task/evidence is rejected by pre-output freeze", () => {
  const { frozen, owned, pairing } = setup();
  for (const s of owned.manifest.samples) s.context.task += " Changed request.";
  const changed = prepareReview(pairing, owned.manifest, "changed-input");
  assert.throws(() => evaluateFrozenReview(frozen, changed), /FROZEN_INPUT_MISMATCH/);
});

test("CLI emits JSON and Markdown from same report and refuses overwriting", (t) => {
  const { input, state } = setup();
  const dir = mkdtempSync(join(tmpdir(), "vpj70-freeze-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const cli = resolve("evals/harness/pairing/frozen-review-cli.ts");
  const run = (...args: string[]) => execFileSync(process.execPath, ["--experimental-strip-types", cli, ...args], { stdio: "pipe" });
  const plan = join(dir, "plan.json"); const frozen = join(dir, "frozen.json"); const source = join(dir, "state.json"); const output = join(dir, "report");
  writeFileSync(plan, JSON.stringify(input)); writeFileSync(source, JSON.stringify(state));
  run("freeze", plan, frozen); run("report", frozen, source, output);
  const report = JSON.parse(readFileSync(join(output, "results.json"), "utf8"));
  assert.equal(readFileSync(join(output, "summary.md"), "utf8"), renderFrozenReview(report));
  assert.throws(() => run("freeze", plan, frozen)); assert.throws(() => run("report", frozen, source, output));
});
