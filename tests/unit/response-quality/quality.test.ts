import assert from "node:assert/strict";
import test from "node:test";
import { prepareReview, importFeedback, qualityReport, blindPackage, deterministicGrade, hash, validateBundle, type Feedback } from "../../../evals/harness/response-quality/index.ts";
import { ownedFixtureInput, fixturePairingReport, fixtureFeedback } from "../../../evals/harness/response-quality/fixtures.ts";

function setup() { const pairing = fixturePairingReport(); const input = ownedFixtureInput(pairing); const state = prepareReview(pairing, input.manifest, "fixed-local-blind-seed"); return { state, input, feedback: fixtureFeedback(state.bundle, input.labels) }; }

test("typed hard gates veto exact facts, permissions and action receipts without parsing prose", () => {
  const { state } = setup(); const good = structuredClone(state.bundle.samples[0]); const clock = state.bundle.pairing.pairing.basis!.clock;
  assert.equal(deterministicGrade(good, clock).status, "PASS");
  for (const mutate of [
    (s: typeof good) => { s.trace!.actorId = "other-owner"; },
    (s: typeof good) => { s.trace!.consumedContextIds = ["unpermitted"]; },
    (s: typeof good) => { s.trace!.allowedContextIds = ["withdrawn"]; s.trace!.consumedContextIds = ["withdrawn"]; s.trace!.revokedContextIds = ["withdrawn"]; },
    (s: typeof good) => { s.trace!.evidence[0].eligible = false; },
    (s: typeof good) => { s.trace!.evidence[0].expiresAt = clock; },
    (s: typeof good) => { s.trace!.facts[0].receiptId = "wrong-receipt"; },
    (s: typeof good) => { s.trace!.facts[0].value = "wrong-value"; },
    (s: typeof good) => { s.trace!.actions = [{ kind: "refund", receiptId: null, proposalRevision: null }]; },
  ]) { const s = structuredClone(good); mutate(s); assert.equal(deterministicGrade(s, clock).status, "FAIL"); }
  good.trace!.actions = [{ kind: "trip_change", receiptId: "applied-receipt", proposalRevision: "r1" }];
  good.trace!.receipts = [{ id: "applied-receipt", kind: "trip_change", status: "completed", proposalRevision: "r1" }];
  assert.equal(deterministicGrade(good, clock).status, "FAIL", "A completion receipt cannot replace independent confirmation");
  good.trace!.confirmedProposalRevision = "r1";
  assert.equal(deterministicGrade(good, clock).status, "PASS");
  good.trace!.confirmedProposalRevision = "r0";
  assert.equal(deterministicGrade(good, clock).status, "FAIL");
  good.trace = null; assert.equal(deterministicGrade(good, clock).status, "NOT_RUN");
});

test("unreviewed semantic errors remain NOT_RUN; fixture labels never become human calibration", () => {
  const { state, feedback } = setup(); const before = qualityReport(state);
  const semantic = before.rows.find((r) => r.sampleId === "owned-en-semantic-error-candidate")!;
  assert.equal(semantic.deterministic.status, "PASS");
  assert.equal(semantic.semantic.status, "NOT_RUN");
  assert.equal(semantic.verdict, "evidence_insufficient");
  const after = qualityReport(importFeedback(state, feedback, "fixture"));
  assert.equal(after.rows.find((r) => r.sampleId === semantic.sampleId)!.verdict, "FAIL");
  assert.equal(after.counts.humanDeclaredFeedback, 0);
  assert.equal(after.humanCalibration, "UNRUN");
  assert.equal(after.adoption, "UNRUN");
  assert.equal(after.rows.find((r) => r.sampleId === "owned-zh-tie-baseline")!.sourcePairingVerdict, "NOT_RUN");
});

test("A/B swaps normalize the same winner, preserve ties and both-fail, and expose order disagreement", () => {
  const { state, feedback } = setup();
  const report = qualityReport(importFeedback(state, feedback, "fixture"));
  assert.ok(report.comparisons.some((c) => c.preference === "tie"));
  assert.ok(report.comparisons.some((c) => c.preference === "both_fail" && c.hardGate === "both_fail"));
  assert.ok(report.comparisons.every((c) => c.orderDisagreements.length === 0));
  for (const pair of state.bundle.pairs) { assert.equal(pair.presentations[0].A, pair.presentations[1].B); assert.equal(pair.presentations[0].B, pair.presentations[1].A); }
  const pair = state.bundle.pairs.find((p) => p.baselineId.includes("typed-error"))!;
  const votes = feedback.filter((f) => pair.presentations.some((p) => p.id === f.presentationId)).map((f) => ({ ...f, choice: "A" as const }));
  const biased = qualityReport(importFeedback(state, votes, "fixture")).comparisons.find((c) => c.pairId === pair.id)!;
  assert.equal(biased.preference, "disagreement");
  assert.equal(biased.orderDisagreements.length, 1);
});

test("repeated imports deduplicate while changed feedback is an explicit conflict", () => {
  const { state, feedback } = setup();
  const once = importFeedback(state, feedback, "fixture"); const twice = importFeedback(once, feedback, "fixture");
  assert.equal(twice.feedback.length, feedback.length);
  assert.equal(importFeedback(once, [{ ...feedback[0], id: "resubmitted-id" }], "fixture").feedback.length, feedback.length);
  assert.throws(() => importFeedback(once, [{ ...feedback[0], choice: feedback[0].choice === "tie" ? "A" : "tie" }], "fixture"), /FEEDBACK_CONFLICT/);
});

test("wrong case, versions, source, rubric completeness and N/A substitutions reject", () => {
  const { state, feedback } = setup(); const original = feedback[0];
  for (const mutate of [
    (f: Feedback) => { f.caseId = "H02"; },
    (f: Feedback) => { Reflect.set(f, "schemaVersion", "future-version"); },
    (f: Feedback) => { f.bundleHash = "a".repeat(64); },
    (f: Feedback) => { Reflect.set(f, "rubricVersion", "future-rubric"); },
    (f: Feedback) => { f.source = { kind: "human", recordRef: "not-a-human-review", method: "manual-local", attribution: "operator-declared" }; },
    (f: Feedback) => { f.ratings.A.scores.goal = "N/A"; },
    (f: Feedback) => { f.ratings.A.reasons.goal = ""; },
    (f: Feedback) => { f.ratings.A.quotes.goal = "not in the response"; },
    (f: Feedback) => { Reflect.deleteProperty(f.ratings.A.scores, "tone"); },
  ]) { const f = structuredClone(original); mutate(f); assert.throws(() => importFeedback(state, [f], "fixture")); }
  assert.throws(() => importFeedback(state, feedback, "human"), /FEEDBACK_SOURCE_MISMATCH/);
});

test("human source validation is operator-declared, never verified identity or calibration", () => {
  const { state, feedback } = setup(); const human = structuredClone(feedback[0]);
  human.id = "simulated-human-import-contract";
  human.source = { kind: "human", recordRef: "human:simulated-local-record", method: "manual-local", attribution: "operator-declared" };
  const result = qualityReport(importFeedback(state, [human], "human"));
  assert.equal(result.counts.humanDeclaredFeedback, 1);
  assert.equal(result.humanCalibration, "UNRUN");
  // This simulated parser test does not write a human-scored artifact.
});

test("reviewer projection is blind and bundle tampering cannot silently change answer identity", () => {
  const { state } = setup(); const pack = JSON.stringify(blindPackage(state.bundle));
  assert.doesNotMatch(pack, /baselineId|candidateId|h01-baseline|h01-unchanged|typed-error|semantic-error|owned-en|trace|configuration/);
  const altered = structuredClone(state.bundle); altered.samples[0].output = { ...altered.samples[0].output, message: { ...altered.samples[0].output.message, text: altered.samples[0].output.message.text + " changed" } };
  assert.throws(() => validateBundle(altered), /BUNDLE_HASH_MISMATCH/);
  const mapping = structuredClone(state.bundle); mapping.pairs[0].presentations[1].A = mapping.pairs[0].presentations[0].A;
  const { hash: _old, ...rest } = mapping; mapping.hash = hash(rest);
  assert.throws(() => validateBundle(mapping), /INVALID_BLIND_MAPPING/);
});

test("owned exposed variants preserve canonical 8/4 metadata and cannot import holdout or external data", () => {
  const { state, input } = setup();
  assert.equal(state.bundle.suite.independentCases, 12); assert.equal(state.bundle.suite.development, 8); assert.equal(state.bundle.suite.holdout, 4);
  assert.equal(state.bundle.exposures.length, 20); assert.ok(state.bundle.exposures.every((e) => e.caseId === "H01" && e.group === "development"));
  const holdout = structuredClone(input.manifest); holdout.samples[0].caseId = "H03";
  assert.throws(() => prepareReview(fixturePairingReport(), holdout, "seed"), /HOLDOUT_OR_UNKNOWN_CASE/);
  const external = structuredClone(input.manifest); Reflect.set(external.samples[0], "source", { kind: "external", repo: "unreviewed", revision: "rev", originalId: "1", license: "CC-BY-NC-4.0" });
  assert.throws(() => prepareReview(fixturePairingReport(), external, "seed"), /UNAPPROVED_SAMPLE_SOURCE/);
});


test("perfect soft feedback cannot compensate a deterministic hard failure", () => {
  const { state, feedback } = setup();
  const optimistic = structuredClone(feedback).map((f) => {
    for (const side of ["A", "B"] as const) {
      for (const id of Object.keys(f.ratings[side].scores) as Array<keyof typeof f.ratings.A.scores>) if (f.ratings[side].scores[id] !== "N/A") f.ratings[side].scores[id] = 2;
      f.ratings[side].hardFailures = [];
    }
    return f;
  });
  const result = qualityReport(importFeedback(state, optimistic, "fixture"));
  assert.equal(result.rows.find((r) => r.sampleId === "owned-en-typed-error-candidate")!.verdict, "FAIL");
});

test("fixture provenance cannot be promoted to human by changing the source tag", () => {
  const { state, feedback } = setup(); const forged = structuredClone(feedback[0]);
  forged.source = { kind: "human", recordRef: forged.source.recordRef, method: "manual-local", attribution: "operator-declared" };
  assert.throws(() => importFeedback(state, [forged], "human"), /FEEDBACK_SOURCE_MISMATCH/);
});


test("unknown parent grading versions and mismatched source basis are rejected", () => {
  const pairing = fixturePairingReport(); const input = ownedFixtureInput(pairing);
  const wrongVersion = structuredClone(pairing); wrongVersion.graderVersion = "unknown-grader";
  assert.throws(() => prepareReview(wrongVersion, input.manifest, "seed"), /INVALID_PAIRING_VERSION/);
  const wrongHash = structuredClone(pairing); Reflect.set(wrongHash.pairing.basis!, "inputHash", "a".repeat(64));
  assert.throws(() => prepareReview(wrongHash, input.manifest, "seed"), /INVALID_PAIRING_VERSION/);
});

test("one presentation's feedback cannot establish an order-bias check", () => {
  const { state, feedback } = setup();
  const report = qualityReport(importFeedback(state, [feedback[0]], "fixture"));
  const checked = report.comparisons.find((c) => c.votes.length === 1)!;
  assert.equal(checked.orderChecks[0].reviewedOrders, 1);
  assert.equal(checked.orderChecks[0].status, "NOT_RUN");
});
