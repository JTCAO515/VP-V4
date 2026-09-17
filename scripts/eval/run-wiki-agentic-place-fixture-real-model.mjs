#!/usr/bin/env node
// VPJ-76 (#360) round 24 follow-up on the slice-11 real-model pass
// (artifacts/VPJ-76/wiki-frozen-eval-real-model-20260916/verification.md).
// That earlier real-GLM run flagged an unresolved "category 4" gap: 4/6
// place-question scenarios (place_address/place_opening_hours, zh+en) came
// back retrieval_miss, and the run's own evidence (retrieval_miss strips
// rounds/queries by design) could not explain why. One of two proposed,
// non-exclusive causes: the place-fixture corpus's generic phrasing never
// named the specific place the question asked about ("the named
// attraction" / "这个景点", with no name anywhere in question or corpus
// text). artifacts/VPJ-76/unrun.md's item (b) names this as the concrete
// next step: "name the specific place in the place-fixture corpus text so
// the place-question retrieval gap can be re-tested and actually
// diagnosed." cases.ts v2 (this same round) did that -- both the question
// text and the corpus statement text now consistently name a synthetic
// attraction, "Cloudscape Pavilion" / 云境阁 -- matching how every other
// question family in this eval already names its own real concept instead
// of an underscored placeholder. This script re-runs the frozen set
// against a REAL model to see whether that fixture-realism fix actually
// changes the place-question retrieval outcome, which a fixture-transport
// test (already re-run and still green after the cases.ts edit) cannot
// show on its own.
//
// Provider: Qwen (dashscope), not GLM. As of this round (2026-09-17):
// GLM's configured key is valid but the account itself has zero real
// balance (a real HTTP 429, confirmed in this same round before writing
// this script -- see this run's own verification.md); Qwen's configured
// key has real usable balance (also confirmed this round, and the
// provider round 22 already proved reachable for a different real-model
// script -- run-wiki-statement-proposals-injection-real-model.mjs). The
// model id itself is resolved automatically from `provider.provider ===
// "qwen"` by lib/server/model-gateway/adapters/provider-protocol.ts
// (MODEL_PROFILES.qwen_37_strict.providerModelId) -- this script does not
// hardcode a model id.
//
// New in this script (addressing artifacts/VPJ-76/unrun.md's item (c),
// "log raw model responses on MODEL_OUTPUT_INVALID for real
// diagnosability", at the SCRIPT layer only -- not a change to
// provider-protocol.ts or any other shared production module, which
// unrun.md itself flags as needing careful, separate review before
// touching): a capturing fetch wrapper records the raw HTTP status/body
// for every real model call, and every row here (not just mismatches)
// carries its own rawResponseStatus/rawResponseText, following the exact
// pattern already used in
// scripts/eval/run-wiki-statement-proposals-injection-real-model.mjs. This
// lets a MODEL_OUTPUT_INVALID/provider_failure row in this run's own
// results.json be diagnosed directly, instead of remaining an unexplained
// gap like slice 11's follow-up run.
//
// The corpus/RPC side stays fixture (the same deterministic, synthetic,
// already-reviewed statements cases.ts defines) -- only the model call
// itself is real. Mechanism-only scenarios that exist purely to force a
// specific fixture failure path (provider_failure's forced 500,
// budget_exhausted's scripted always-search model) are skipped: a real
// model cannot be scripted into those, and the fixture pass already
// covers that mechanism.
//
// Manual/on-demand only -- never wired into `pnpm evals`/CI, real billed
// calls. Reads QWEN_API_KEY from lib/server/jobs/.local/.env (gitignored,
// operator-provided).
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { scenarios, versions } from "../../evals/wiki-agentic-search/cases.ts";
import { runGroundedWikiSearch } from "../../lib/server/knowledge/wiki/grounded-search.ts";
import { isPlaceQuestionId } from "../../lib/server/knowledge/claim/questions.ts";

const outputDirectory = new URL("../../artifacts/VPJ-76/wiki-agentic-search-place-fixture-real-model-20260917/", import.meta.url);
const envPath = new URL("../../lib/server/jobs/.local/.env", import.meta.url);

function loadEnvKey(name) {
  let text;
  try { text = readFileSync(envPath, "utf8"); }
  catch { throw new Error(`${envPath} not found -- this script needs the operator-provided local key file`); }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    if (trimmed.slice(0, index) === name) return trimmed.slice(index + 1).trim();
  }
  return null;
}

const apiKey = loadEnvKey("QWEN_API_KEY");
if (!apiKey) { console.error("QWEN_API_KEY not set in lib/server/jobs/.local/.env -- nothing to run"); process.exit(1); }

const provider = Object.freeze({ provider: "qwen", endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", configurationId: "55555555-5555-4555-8555-555555555555", configurationVersion: 1, timeoutMs: 30000 });

function sceneFor(questionId) {
  if (questionId === "rail_boarding_documents") return "rail";
  if (questionId.startsWith("payment_")) return "payment";
  if (questionId.startsWith("connectivity_")) return "connectivity";
  return "attraction";
}

function knowledgeReadResponse(scenario) {
  return {
    schemaVersion: "knowledge-read/1", evaluatedAt: "2026-09-17T00:00:00Z",
    scope: { city: scenario.city, scene: isPlaceQuestionId(scenario.questionId) ? "attraction" : sceneFor(scenario.questionId), locale: scenario.locale },
    purpose: "trip_planning", recipient: "first_party", territory: "CN-mainland",
    status: scenario.corpus.length > 0 ? "available" : "no_eligible_content",
    statements: scenario.corpus.map((entry) => ({
      factId: entry.factId, version: 1, assertionId: entry.assertionId, assertionRevision: 1,
      assertion: { subjectId: "synthetic-subject", predicate: entry.predicate, objectId: entry.objectId },
      text: entry.text[scenario.locale], conditions: [], exclusions: [],
      sources: [{ sourceRevisionId: entry.sourceId, sourceKey: entry.factId, revisionLabel: "r1", publisher: "Synthetic", uri: "urn:synthetic", locator: "p1" }],
    })),
  };
}

function intentFor(scenario) {
  // Matches cases.ts v2's own place-question naming (see that file's
  // comment) -- kept consistent even though grounded-search.ts does not
  // read intent.placeName today.
  return isPlaceQuestionId(scenario.questionId)
    ? { intent: scenario.questionId, requestScope: "single", placeName: "Cloudscape Pavilion", unansweredNeeds: [] }
    : { intent: scenario.questionId, requestScope: "single" };
}

const SKIP_KINDS = new Set(["provider_failure", "budget_exhausted"]);
const runSet = scenarios.filter((s) => !SKIP_KINDS.has(s.kind));

async function main() {
  const rows = [];
  let index = 0;
  for (const scenario of runSet) {
    index += 1;
    process.stderr.write(`[${index}/${runSet.length}] ${scenario.id} ...\n`);
    const rpc = async () => ({ data: knowledgeReadResponse(scenario), error: null });
    let rawResponseStatus = null;
    let rawResponseText = null;
    const capturingFetch = async (url, init) => {
      const response = await fetch(url, init);
      rawResponseStatus = response.status;
      try { rawResponseText = await response.clone().text(); } catch { rawResponseText = null; }
      return response;
    };
    const deps = { credential: () => apiKey, recordDestination: async () => {}, fetch: capturingFetch };
    const input = { intent: intentFor(scenario), question: scenario.question, city: scenario.city, locale: scenario.locale, maxRounds: 2, maxOutputTokens: 2000, timeoutMs: 25000, provider };
    const started = performance.now();
    let outcome;
    try {
      outcome = await runGroundedWikiSearch(input, { ...deps, rpc }, new AbortController().signal);
    } catch (error) {
      outcome = { kind: "unavailable", reason: "provider_failure", providerCode: `THROWN:${error instanceof Error ? error.message : "unknown"}` };
    }
    const elapsedMs = Math.round((performance.now() - started) * 10) / 10;
    const kindMatches = outcome.kind === scenario.expected.kind;
    const reasonMatches = !(outcome.kind === "unavailable" && scenario.expected.reason) || outcome.reason === scenario.expected.reason;
    let requiredCovered = 0;
    let coverageMatches = true;
    if (outcome.kind === "answered") {
      requiredCovered = outcome.evidence.required.filter((c) => c.status === "covered").length;
      if (scenario.kind === "full_coverage" && scenario.claims.length > 0) coverageMatches = requiredCovered === scenario.claims.length;
    }
    const matchesExpected = kindMatches && reasonMatches && coverageMatches;
    rows.push({
      id: scenario.id, group: scenario.group, questionId: scenario.questionId, locale: scenario.locale, kind: scenario.kind,
      isPlaceQuestion: isPlaceQuestionId(scenario.questionId),
      expectedKind: scenario.expected.kind, outcomeKind: outcome.kind, reason: outcome.kind === "unavailable" ? outcome.reason : undefined,
      providerCode: outcome.kind === "unavailable" ? outcome.providerCode : undefined,
      requiredCovered, requiredTotal: scenario.claims.length, matchesExpected,
      elapsedMs, usageTotalTokens: "usage" in outcome ? outcome.usage.totalTokens : 0,
      rounds: "rounds" in outcome ? outcome.rounds : null,
      summary: outcome.kind === "answered" ? outcome.summary : null,
      citedPageKeys: outcome.kind === "answered" ? outcome.citations.map((c) => c.pageKey) : [],
      rawResponseStatus, rawResponseText,
    });
    process.stderr.write(`  -> ${outcome.kind}${outcome.kind === "unavailable" ? "/" + outcome.reason : ""} in ${elapsedMs}ms, matches=${matchesExpected}\n`);
  }

  const matched = rows.filter((r) => r.matchesExpected).length;
  const answered = rows.filter((r) => r.outcomeKind === "answered").length;
  const placeRows = rows.filter((r) => r.isPlaceQuestion);
  const placeMatched = placeRows.filter((r) => r.matchesExpected).length;
  const sortedElapsed = [...rows.map((r) => r.elapsedMs)].sort((a, b) => a - b);
  const percentile = (p) => sortedElapsed[Math.min(sortedElapsed.length - 1, Math.floor((p / 100) * sortedElapsed.length))];
  const totalTokens = rows.reduce((sum, r) => sum + r.usageTotalTokens, 0);

  let commit = "unknown";
  try { commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: new URL("../../", import.meta.url), encoding: "utf8" }).trim(); } catch { /* an exported source tree has no commit */ }

  const report = {
    schemaVersion: 1, versions, commit, mode: "real_model", provider: "qwen", model: "qwen3.7-plus-2026-05-26",
    skippedKinds: [...SKIP_KINDS], skippedCount: scenarios.length - runSet.length,
    note: "Real HTTP calls to Qwen (dashscope.aliyuncs.com); the knowledge_read_v1 RPC side stays fixture (the same synthetic, already-reviewed statements the fixture pass uses). elapsedMs and usageTotalTokens are real. This is a real bill against the operator-provided key. Every row carries rawResponseStatus/rawResponseText (the actual HTTP response this run received), addressing artifacts/VPJ-76/unrun.md item (c) at this script's own layer -- provider-protocol.ts itself is unchanged.",
    placeQuestionFocus: { total: placeRows.length, matched: placeMatched, comparedTo: "artifacts/VPJ-76/wiki-frozen-eval-real-model-20260916/verification.md's category 4 (real GLM run, 2026-09-16): 2/6 place scenarios matched ground truth there (4 were retrieval_miss against a full_coverage expectation). This run uses cases.ts v2's named-attraction fixture text and a different provider (Qwen, not GLM), so it is a fixture-realism + provider re-test, not a controlled single-variable comparison." },
    counts: { total: rows.length, matchedExpected: matched, mismatched: rows.length - matched, answered, unavailable: rows.filter((r) => r.outcomeKind === "unavailable").length },
    metrics: { accuracyPercent: Math.round((matched / rows.length) * 1000) / 10, coverageRatePercent: Math.round((answered / rows.length) * 1000) / 10, p50ElapsedMs: percentile(50), p95ElapsedMs: percentile(95), totalTokens },
    rows,
    verdict: matched === rows.length ? "PASS" : "PARTIAL",
  };
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(new URL("results.json", outputDirectory), `${JSON.stringify(report, null, 2)}\n`);
  const mismatches = rows.filter((r) => !r.matchesExpected);
  writeFileSync(new URL("summary.md", outputDirectory), `# VPJ-76 冻结评测集（真实模型：Qwen qwen3.7-plus-2026-05-26，命名具体地点后重测）\n\n${rows.length} 个场景真实跑通（跳过 ${report.skippedCount} 个纯机制性场景：provider_failure/budget_exhausted，无法用真实模型脚本化触发）。\n\n准确率 ${report.metrics.accuracyPercent}%（${matched}/${rows.length} 匹配预期真值）。地点类场景单独：${placeMatched}/${placeRows.length} 匹配。覆盖率 ${report.metrics.coverageRatePercent}%。p50 ${report.metrics.p50ElapsedMs}ms / p95 ${report.metrics.p95ElapsedMs}ms（真实网络+模型延迟）。累计真实 usage token：${totalTokens}。\n\n判定：${report.verdict}。\n\n${mismatches.length ? `## 与预期不符的场景\n\n${mismatches.map((r) => `- ${r.id}: 预期 ${r.expectedKind}，实际 ${r.outcomeKind}${r.reason ? "/" + r.reason : ""}${r.providerCode ? ` (${r.providerCode})` : ""}`).join("\n")}\n\n` : ""}${rows.map((r) => `- ${r.id} [${r.group}]: ${r.kind} → ${r.outcomeKind}${r.reason ? "/" + r.reason : ""} (${r.rounds ?? "?"} rounds, ${r.elapsedMs}ms, covered ${r.requiredCovered}/${r.requiredTotal})`).join("\n")}\n`);
  console.log(`Wrote report to ${outputDirectory.pathname}`);
  console.log(`verdict=${report.verdict} accuracy=${report.metrics.accuracyPercent}% place=${placeMatched}/${placeRows.length} coverage=${report.metrics.coverageRatePercent}% totalTokens=${totalTokens}`);
}

await main();
