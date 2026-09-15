#!/usr/bin/env node
// VPJ-76 (#360) slice 11 follow-up: a real-model pass over the frozen
// evals/wiki-agentic-search/ scenario set, explicitly authorized by JT
// ("授权跑评测集") after the fixture-only pass (slice 11) was chosen
// deliberately to avoid spending the configured API key budget without a
// separate go-ahead. This is a manual, on-demand script -- never wired
// into `pnpm evals`/CI -- because it makes real, billed HTTP calls.
//
// Reads GLM_API_KEY from lib/server/jobs/.local/.env (gitignored, never
// committed). Qwen (dashscope.aliyuncs.com) and DeepSeek (a known stale
// providerModelId bug flagged in wiki-real-model-probe-20260915, not
// fixed here -- out of this script's scope) are both skipped; GLM is the
// one provider already proven reachable and working end to end earlier
// in this session.
//
// The corpus/RPC side stays fixture (the same deterministic, free,
// already-reviewed synthetic statements cases.ts defines) -- only the
// model call itself is real. Mechanism-only scenarios that exist purely
// to force a specific fixture failure path (provider_failure's forced
// 500, budget_exhausted's scripted always-search model) are skipped: a
// real model cannot be scripted into those, and slice 11's fixture pass
// already covers that mechanism.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { scenarios, versions } from "../../evals/wiki-agentic-search/cases.ts";
import { runGroundedWikiSearch } from "../../lib/server/knowledge/wiki/grounded-search.ts";
import { isPlaceQuestionId } from "../../lib/server/knowledge/claim/questions.ts";

const outputDirectory = new URL("../../artifacts/VPJ-76/wiki-frozen-eval-real-model-20260916/", import.meta.url);
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

const apiKey = loadEnvKey("GLM_API_KEY");
if (!apiKey) { console.error("GLM_API_KEY not set in lib/server/jobs/.local/.env -- nothing to run"); process.exit(1); }

const provider = Object.freeze({ provider: "glm", endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions", configurationId: "22222222-2222-2222-2222-222222222222", configurationVersion: 1, timeoutMs: 30000 });
const deps = Object.freeze({ credential: () => apiKey, recordDestination: async () => {} });

function sceneFor(questionId) {
  if (questionId === "rail_boarding_documents") return "rail";
  if (questionId.startsWith("payment_")) return "payment";
  if (questionId.startsWith("connectivity_")) return "connectivity";
  return "attraction";
}

function knowledgeReadResponse(scenario) {
  return {
    schemaVersion: "knowledge-read/1", evaluatedAt: "2026-09-16T00:00:00Z",
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
  return isPlaceQuestionId(scenario.questionId)
    ? { intent: scenario.questionId, requestScope: "single", placeName: "Synthetic Landmark", unansweredNeeds: [] }
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
      expectedKind: scenario.expected.kind, outcomeKind: outcome.kind, reason: outcome.kind === "unavailable" ? outcome.reason : undefined,
      providerCode: outcome.kind === "unavailable" ? outcome.providerCode : undefined,
      requiredCovered, requiredTotal: scenario.claims.length, matchesExpected,
      elapsedMs, usageTotalTokens: "usage" in outcome ? outcome.usage.totalTokens : 0,
      rounds: "rounds" in outcome ? outcome.rounds : null,
      summary: outcome.kind === "answered" ? outcome.summary : null,
    });
    process.stderr.write(`  -> ${outcome.kind}${outcome.kind === "unavailable" ? "/" + outcome.reason : ""} in ${elapsedMs}ms, matches=${matchesExpected}\n`);
  }

  const matched = rows.filter((r) => r.matchesExpected).length;
  const answered = rows.filter((r) => r.outcomeKind === "answered").length;
  const sortedElapsed = [...rows.map((r) => r.elapsedMs)].sort((a, b) => a - b);
  const percentile = (p) => sortedElapsed[Math.min(sortedElapsed.length - 1, Math.floor((p / 100) * sortedElapsed.length))];
  const totalTokens = rows.reduce((sum, r) => sum + r.usageTotalTokens, 0);

  let commit = "unknown";
  try { commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: new URL("../../", import.meta.url), encoding: "utf8" }).trim(); } catch { /* an exported source tree has no commit */ }

  const report = {
    schemaVersion: 1, versions, commit, mode: "real_model", provider: "glm", model: "glm-5.3-flash",
    skippedKinds: [...SKIP_KINDS], skippedCount: scenarios.length - runSet.length,
    note: "Real HTTP calls to GLM (open.bigmodel.cn); the knowledge_read_v1 RPC side stays fixture (the same synthetic, already-reviewed statements the fixture pass uses). elapsedMs and usageTotalTokens are real. This is a real bill against the operator-provided key.",
    counts: { total: rows.length, matchedExpected: matched, mismatched: rows.length - matched, answered, unavailable: rows.filter((r) => r.outcomeKind === "unavailable").length },
    metrics: { accuracyPercent: Math.round((matched / rows.length) * 1000) / 10, coverageRatePercent: Math.round((answered / rows.length) * 1000) / 10, p50ElapsedMs: percentile(50), p95ElapsedMs: percentile(95), totalTokens },
    rows,
    verdict: matched === rows.length ? "PASS" : "PARTIAL",
  };
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(new URL("results.json", outputDirectory), `${JSON.stringify(report, null, 2)}\n`);
  const mismatches = rows.filter((r) => !r.matchesExpected);
  writeFileSync(new URL("summary.md", outputDirectory), `# VPJ-76 冻结评测集（真实模型：GLM-5.3-flash）\n\n${rows.length} 个场景真实跑通（跳过 ${report.skippedCount} 个纯机制性场景：provider_failure/budget_exhausted，无法用真实模型脚本化触发）。\n\n准确率 ${report.metrics.accuracyPercent}%（${matched}/${rows.length} 匹配预期真值）。覆盖率 ${report.metrics.coverageRatePercent}%。p50 ${report.metrics.p50ElapsedMs}ms / p95 ${report.metrics.p95ElapsedMs}ms（真实网络+模型延迟）。累计真实 usage token：${totalTokens}。\n\n判定：${report.verdict}。\n\n${mismatches.length ? `## 与预期不符的场景\n\n${mismatches.map((r) => `- ${r.id}: 预期 ${r.expectedKind}，实际 ${r.outcomeKind}${r.reason ? "/" + r.reason : ""}${r.providerCode ? ` (${r.providerCode})` : ""}`).join("\n")}\n\n` : ""}${rows.map((r) => `- ${r.id} [${r.group}]: ${r.kind} → ${r.outcomeKind}${r.reason ? "/" + r.reason : ""} (${r.rounds ?? "?"} rounds, ${r.elapsedMs}ms, covered ${r.requiredCovered}/${r.requiredTotal})`).join("\n")}\n`);
  console.log(`Wrote report to ${outputDirectory.pathname}`);
  console.log(`verdict=${report.verdict} accuracy=${report.metrics.accuracyPercent}% coverage=${report.metrics.coverageRatePercent}% totalTokens=${totalTokens}`);
}

await main();
