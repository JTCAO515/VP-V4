import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import test from "node:test";
import { crossSourceCases } from "./cross-source-cases.ts";
import { injectionCases } from "./injection-cases.ts";
import { detectProposalConflicts, isProposalOutput, isStructuredWikiDraft, resolveProposalOutput, type ProposalSource, type StatementWithoutSources } from "../../lib/server/knowledge/wiki/proposals.ts";
import { runWikiStatementProposalJob } from "../../lib/server/jobs/wiki-statement-proposal-job.ts";

/**
 * VPJ-75 (#359): fixture-only frozen bilingual materials closing three items
 * artifacts/VPJ-75/unrun.md names as missing for the bounded statement-proposal
 * job -- multi-source synthesis, contradiction/conflict surfacing, and
 * prompt-injection resistance -- following the same fixture-vs-real-model
 * distinction already established by evals/wiki-agentic-search-safety. All
 * provider responses below are scripted by this file, not a real model call;
 * this proves the validation/detection *code* behaves correctly against
 * realistic bilingual adversarial and contradictory input, not that a real
 * model would write compliant output. A real-model pass remains explicit
 * UNRUN, same as every other #359 slice.
 */

const outputDirectory = new URL("../../artifacts/VPJ-75/wiki-statement-proposals-safety-20260916/", import.meta.url);
const codePointSlice = (snippet: string, start: number, end: number) => Array.from(snippet).slice(start, end).join("");
let uidCounter = 0;
const nextUid = () => { uidCounter += 1; return `${String(uidCounter).padStart(8, "0")}-1111-4111-8111-111111111111`; };

function statementFor(objectId: string, city: "shanghai" | "beijing", conditions: readonly string[]): StatementWithoutSources {
  return {
    schemaVersion: "knowledge-statement/1",
    assertion: { subjectId: "metro_gate", predicate: "accepts_method", objectId, conditions, exclusions: [] },
    scope: { cities: [city], scene: "public_transport", audience: "international_independent_traveler" },
    expressions: {
      zh: { text: "闸机说明", conditions: conditions.map(() => "条件"), exclusions: [] },
      en: { text: "Gate rule", conditions: conditions.map(() => "condition"), exclusions: [] },
    },
  };
}

test("frozen bilingual cross-source materials: multi-source evidence binds independently per source, in both zh and en", () => {
  const rows = crossSourceCases.map((c) => {
    const sourceA: ProposalSource = { id: nextUid(), declaration: { sourceKey: c.sourceA.key, revisionLabel: "1", publisher: "Synthetic", uri: `urn:vpj15:synthetic:${c.sourceA.key}`, locator: "paragraph 1", snippet: c.sourceA.snippet, usageDeclaration: "Synthetic only" } };
    const sourceB: ProposalSource = { id: nextUid(), declaration: { sourceKey: c.sourceB.key, revisionLabel: "1", publisher: "Synthetic", uri: `urn:vpj15:synthetic:${c.sourceB.key}`, locator: "paragraph 1", snippet: c.sourceB.snippet, usageDeclaration: "Synthetic only" } };
    const output = {
      summary: `frozen case ${c.id}`, gaps: [],
      proposals: [
        { statement: statementFor(c.objectIdA, c.sourceA.city, c.conditionsA), evidence: [{ sourceRevisionId: sourceA.id, quote: c.sourceA.snippet }] },
        { statement: statementFor(c.objectIdB, c.sourceB.city, c.conditionsB), evidence: [{ sourceRevisionId: sourceB.id, quote: c.sourceB.snippet }] },
      ],
    };
    assert.equal(isProposalOutput(output), true, `${c.id}: fixture output must itself be schema-valid`);
    const draft = resolveProposalOutput(output, [sourceA, sourceB]);
    assert.ok(draft, `${c.id}: real multi-source snapshots must resolve`);

    // Each evidence entry's stored offsets must reconstruct its OWN quote from
    // its OWN source snippet -- proving the two sources were never conflated,
    // for both a Latin-script (en) and a CJK, non-Latin-offset (zh) case.
    const [evidenceA] = draft.statementProposals[0].evidence;
    const [evidenceB] = draft.statementProposals[1].evidence;
    assert.equal(codePointSlice(c.sourceA.snippet, evidenceA.startOffset, evidenceA.endOffset), c.sourceA.snippet, `${c.id}: source A offsets must reconstruct source A's own quote`);
    assert.equal(codePointSlice(c.sourceB.snippet, evidenceB.startOffset, evidenceB.endOffset), c.sourceB.snippet, `${c.id}: source B offsets must reconstruct source B's own quote`);
    assert.equal(evidenceA.sourceRevisionId, sourceA.id);
    assert.equal(evidenceB.sourceRevisionId, sourceB.id);

    const conflicts = detectProposalConflicts(draft);
    if (c.expectConflict) {
      assert.deepEqual(conflicts, [{ a: 0, b: 1, reason: c.expectedReason }], `${c.id}: expected exactly one flagged conflict`);
    } else {
      assert.deepEqual(conflicts, [], `${c.id}: a legitimate cross-city difference must never be flagged as a conflict`);
    }
    return { id: c.id, locale: c.locale, category: c.category, expectConflict: c.expectConflict, actualConflicts: conflicts };
  });
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(new URL("cross-source-results.json", outputDirectory), `${JSON.stringify({ schemaVersion: 1, mode: "fixture", cases: rows }, null, 2)}\n`);
});

test("cross-source category coverage: same_city_contradiction, cross_city_difference and condition_exception each have a zh and an en case", () => {
  for (const category of ["same_city_contradiction", "cross_city_difference", "condition_exception"] as const) {
    assert.ok(crossSourceCases.some((c) => c.category === category && c.locale === "zh"), `missing zh case for ${category}`);
    assert.ok(crossSourceCases.some((c) => c.category === category && c.locale === "en"), `missing en case for ${category}`);
  }
});

test("documented boundary, locked as a regression: one proposal citing two contradictory sources as its OWN evidence is still accepted -- quote identity is not claim entailment", () => {
  // detectProposalConflicts only compares DIFFERENT proposals' structured
  // assertions; it cannot see inside a single proposal's own evidence list,
  // and nothing in resolveProposalOutput reads prose for agreement. This is
  // the documented boundary already stated in docs/contracts/wiki-statement-
  // proposals.md ("Source binding proves quotation identity, not claim
  // entailment or semantic quality. Human review remains mandatory before any
  // statement becomes published knowledge.") -- this test makes that a
  // provable, trackable contract instead of prose alone: if it ever starts
  // failing because resolveProposalOutput grew real contradiction detection,
  // update this test and the contract doc together, not just one of them.
  const petsAllowed: ProposalSource = { id: nextUid(), declaration: { sourceKey: "pets-notice-a", revisionLabel: "1", publisher: "Synthetic", uri: "urn:vpj15:synthetic:pets-notice-a", locator: "paragraph 1", snippet: "商户告示称，该地铁站允许携带宠物进入。", usageDeclaration: "Synthetic only" } };
  const petsBanned: ProposalSource = { id: nextUid(), declaration: { sourceKey: "pets-notice-b", revisionLabel: "1", publisher: "Synthetic", uri: "urn:vpj15:synthetic:pets-notice-b", locator: "paragraph 1", snippet: "最新公告称，该地铁站禁止携带宠物进入。", usageDeclaration: "Synthetic only" } };
  const output = {
    summary: "one proposal citing both a pets-allowed and a pets-banned notice as its own evidence", gaps: [],
    proposals: [{
      statement: statementFor("pets_allowed", "shanghai", []),
      evidence: [
        { sourceRevisionId: petsAllowed.id, quote: petsAllowed.declaration.snippet },
        { sourceRevisionId: petsBanned.id, quote: petsBanned.declaration.snippet },
      ],
    }],
  };
  assert.equal(isProposalOutput(output), true);
  const draft = resolveProposalOutput(output, [petsAllowed, petsBanned]);
  assert.ok(draft, "current, documented behavior: quote-identity binding accepts this without reading whether the two quotes agree");
  assert.equal(draft.statementProposals[0].evidence.length, 2);
});

function scriptedOutput(quote: string, extraProposalField?: Record<string, unknown>, extraTopLevelField?: Record<string, unknown>) {
  return {
    summary: "compliant with the injected instruction", gaps: [],
    proposals: [{ statement: statementFor("id_check", "shanghai", []), evidence: [{ sourceRevisionId: FIXED_SOURCE_ID, quote }], ...extraProposalField }],
    ...extraTopLevelField,
  };
}
const FIXED_SOURCE_ID = "22222222-1111-4111-8111-111111111111";
const provider = { provider: "qwen" as const, endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", configurationId: FIXED_SOURCE_ID, configurationVersion: 1, timeoutMs: 5000 };
const modelResponse = (output: unknown) => Response.json({ model: "qwen3.7-plus-2026-05-26", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(output) } }], usage: { prompt_tokens: 30, completion_tokens: 60, total_tokens: 90 } });

test("frozen bilingual adversarial fixture set: an injected source instruction cannot smuggle reviewer/publication authority or fabricate a quote, in both zh and en", async () => {
  const rows = [];
  for (const c of injectionCases) {
    const source: ProposalSource = { id: FIXED_SOURCE_ID, declaration: { sourceKey: "injected-source", revisionLabel: "1", publisher: "Synthetic", uri: "urn:vpj15:synthetic:injected-source", locator: "paragraph 1", snippet: c.snippetWithInjection, usageDeclaration: "Synthetic only" } };

    // The safe path: a well-behaved proposal quoting only the legitimate,
    // verbatim sentence must still pass -- safety must not cost the normal answer.
    const safeOutput = scriptedOutput(c.legitimateQuote);
    assert.equal(isProposalOutput(safeOutput), true, `${c.id}: the legitimate quote-only path must remain valid`);
    const safeDraft = resolveProposalOutput(safeOutput, [source]);
    assert.ok(safeDraft, `${c.id}: the legitimate quote-only path must still resolve against the injected-but-real source`);
    // The source's own retained snippet legitimately still contains the injected
    // text verbatim (full source provenance is preserved for reviewer inspection,
    // by design) -- the safety property under test is that the marker never
    // escapes into a *trusted* field (reviewer/publication authority, an extra
    // schema key), which isStructuredWikiDraft's exact-key-set check enforces.
    assert.equal(isStructuredWikiDraft(safeDraft), true, `${c.id}: the legitimate quote-only path must remain a schema-clean draft with no smuggled fields`);
    assert.ok(!safeDraft.statementProposals[0].statement.assertion.subjectId.includes(c.complianceMarker) && !safeDraft.summary.includes(c.complianceMarker), `${c.id}: the injected marker must never appear in a trusted (non-source-quote) field`);

    // The worst-case compliant path: a model that fully obeys the injection.
    let rejected: "structural" | "worker" | "not-rejected";
    if (c.category === "authority_injection") {
      const bad = scriptedOutput(c.legitimateQuote, { reviewerId: c.complianceMarker });
      rejected = isProposalOutput(bad) ? "not-rejected" : "structural";
    } else if (c.category === "role_override") {
      const bad = scriptedOutput(c.legitimateQuote, undefined, { published: true, publishedBy: c.complianceMarker });
      rejected = isProposalOutput(bad) ? "not-rejected" : "structural";
    } else {
      const bad = scriptedOutput(c.complianceMarker);
      rejected = resolveProposalOutput(bad as any, [source]) === null ? "structural" : "not-rejected";
    }
    assert.equal(rejected, "structural", `${c.id}: the injected-instruction-compliant output must be structurally rejected`);

    // Same assertion through the actual worker/protocol path (real code, scripted transport)
    // end to end, not just the raw validator function.
    const badForWorker = c.category === "authority_injection" ? scriptedOutput(c.legitimateQuote, { reviewerId: c.complianceMarker })
      : c.category === "role_override" ? scriptedOutput(c.legitimateQuote, undefined, { published: true })
      : scriptedOutput(c.complianceMarker);
    const workerResult = await runWikiStatementProposalJob(
      { dataClass: "c0_synthetic", sources: [source], configDigest: "a".repeat(64), provider, maxOutputTokens: 2048, timeoutMs: 5000 },
      { credential: () => "synthetic", recordDestination: async () => {}, fetch: async () => modelResponse(badForWorker) },
      new AbortController().signal,
    );
    assert.equal(workerResult.kind, "failed", `${c.id}: the real worker path must also reject the injected-instruction-compliant output`);
    assert.equal((workerResult as { errorCode: string }).errorCode, "MODEL_OUTPUT_INVALID");

    rows.push({ id: c.id, locale: c.locale, category: c.category, marker: c.complianceMarker, structuralRejection: rejected, workerRejection: workerResult.kind });
  }
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(new URL("injection-results.json", outputDirectory), `${JSON.stringify({ schemaVersion: 1, mode: "fixture", cases: rows }, null, 2)}\n`);
});

test("injection attack-category coverage: authority_injection, role_override and fabricated_quote each have a zh and an en case, and the report is written", () => {
  for (const category of ["authority_injection", "role_override", "fabricated_quote"] as const) {
    assert.ok(injectionCases.some((c) => c.category === category && c.locale === "zh"), `missing zh case for ${category}`);
    assert.ok(injectionCases.some((c) => c.category === category && c.locale === "en"), `missing en case for ${category}`);
  }
  let commit = "unknown";
  try { commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: new URL("../../", import.meta.url), encoding: "utf8" }).trim(); } catch { /* an exported source tree has no commit */ }
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(new URL("summary.md", outputDirectory), `# VPJ-75 (#359): frozen bilingual multi-source + injection safety for statement proposals (fixture)\n\ncommit ${commit}\n\n## Cross-source cases (multi-source binding + structural conflict detection)\n\n${crossSourceCases.map((c) => `- **${c.id}** [${c.category}, ${c.locale}]: expectConflict=${c.expectConflict}`).join("\n")}\n\n## Injection cases (structural containment against a source-embedded instruction; real-model resistance is a separate, not-yet-run follow-up)\n\n${injectionCases.map((c) => `- **${c.id}** [${c.category}, ${c.locale}]: marker \`${c.complianceMarker}\``).join("\n")}\n`);
});
