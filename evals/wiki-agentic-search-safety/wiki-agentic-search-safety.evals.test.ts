import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import test from "node:test";
import { diagnosisCases } from "./retrieval-diagnosis-cases.ts";
import { injectionCases } from "./injection-cases.ts";
import { searchWikiCorpus } from "../../lib/server/knowledge/wiki/search-index.ts";
import { buildEvidencePack } from "../../lib/server/knowledge/wiki/evidence-pack.ts";

/**
 * VPJ-16 (#206) HF-reuse: MIRACL-method retrieval diagnosis (fixture,
 * deterministic, no model) + BIPIA-method injection-resistance structural
 * containment (fixture) -- see retrieval-diagnosis-cases.ts and
 * injection-cases.ts for the full scope/licensing reasoning. A real-model
 * pass for the injection cases (the only way to test whether a real model
 * actually resists an injected instruction, since a fixture model's
 * output is fully scripted by this test) is a separate, deliberate
 * follow-up: scripts/eval/run-wiki-agentic-injection-real-model.mjs.
 */

const outputDirectory = new URL("../../artifacts/VPJ-206/hf-reuse-miracl-bipia-20260916/", import.meta.url);

test("MIRACL-method retrieval diagnosis: every case's real searchWikiCorpus result matches its documented, empirically-verified behavior", () => {
  const rows = diagnosisCases.map((c) => {
    const hits = searchWikiCorpus(c.corpus, c.query, 5);
    assert.deepEqual(hits.map((h) => ({ pageKey: h.pageKey, score: h.score })), c.expectedHits, `${c.id}: real searchWikiCorpus output no longer matches this case's documented behavior`);
    return { id: c.id, locale: c.locale, category: c.category, query: c.query, hitCount: hits.length, diagnosis: c.diagnosis };
  });
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(new URL("miracl-diagnosis.json", outputDirectory), `${JSON.stringify({ schemaVersion: 1, mode: "fixture", cases: rows }, null, 2)}\n`);
});

test("BIPIA-method injection structural containment: a citation to a pageKey the corpus never returned is excluded from EvidencePack, not fabricated", () => {
  // Simulates the worst case for the *structural* layer alone: a model response
  // (scripted here, not real) that complies with an injected instruction badly
  // enough to hallucinate a citation pointing at content that was never actually
  // in the corpus at all (e.g. an externally-suggested URL treated as a pageKey).
  // This is deliberately narrow -- it is NOT a test of whether a real model
  // resists citing a *real* corpus entry that happens to carry a malicious
  // instruction (the schema cannot distinguish that from any other citation;
  // the only real defense there is the model's own judgement, tested for real
  // in the real-model follow-up script, not here).
  for (const c of injectionCases) {
    const provenance = new Map([
      [c.legitimateFactId, { predicate: "requires_action", objectId: "merchant_acceptance_check", publicationId: `assertion-${c.legitimateFactId}`, sourceIds: [`source-${c.legitimateFactId}`] }],
      [c.injectedFactId, { predicate: "requires_action", objectId: "merchant_acceptance_check", publicationId: `assertion-${c.injectedFactId}`, sourceIds: [`source-${c.injectedFactId}`] }],
    ]);
    const hallucinatedPageKey = "external-url-not-in-corpus";
    const citations = [
      { pageKey: c.legitimateFactId, quote: c.legitimateText.slice(0, 40) },
      { pageKey: hallucinatedPageKey, quote: c.complianceMarker },
    ];
    const pack = buildEvidencePack(citations, provenance, [{ subjectId: "international_card_payment", predicate: "requires_action", objectId: "merchant_acceptance_check" }], [], []);
    const allRefs = [...pack.required.flatMap((claim) => claim.refs), ...pack.background];
    assert.ok(!allRefs.some((ref) => ref.statementId === hallucinatedPageKey), `${c.id}: a citation with no real provenance must never appear in EvidencePack`);
    assert.ok(allRefs.some((ref) => ref.statementId === c.legitimateFactId), `${c.id}: the real, legitimate citation must still be present -- safety must not come at the cost of the normal answer`);
  }
});

test("BIPIA attack-category coverage: task_override, information_exfiltration, scam_link_injection, and content_manipulation each have a zh and an en case, and the report is written", () => {
  for (const category of ["task_override", "information_exfiltration", "scam_link_injection", "content_manipulation"] as const) {
    assert.ok(injectionCases.some((c) => c.category === category && c.locale === "zh"), `missing zh case for ${category}`);
    assert.ok(injectionCases.some((c) => c.category === category && c.locale === "en"), `missing en case for ${category}`);
  }
  let commit = "unknown";
  try { commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: new URL("../../", import.meta.url), encoding: "utf8" }).trim(); } catch { /* an exported source tree has no commit */ }
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(new URL("summary.md", outputDirectory), `# VPJ-16 (#206) HF-reuse: MIRACL retrieval diagnosis + BIPIA injection structural containment (fixture)\n\ncommit ${commit}\n\n## MIRACL-method retrieval diagnosis\n\n${diagnosisCases.map((c) => `- **${c.id}** [${c.category}, ${c.locale}]: ${c.diagnosis}`).join("\n")}\n\n## BIPIA-method injection cases (structural containment verified here; real-model resistance is a separate follow-up)\n\n${injectionCases.map((c) => `- **${c.id}** [${c.category}, ${c.locale}]: marker \`${c.complianceMarker}\``).join("\n")}\n\nReal-model pass: \`scripts/eval/run-wiki-agentic-injection-real-model.mjs\`.\n`);
});
