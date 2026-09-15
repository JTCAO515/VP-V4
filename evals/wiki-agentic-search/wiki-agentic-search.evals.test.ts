import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { scenarios, versions, type Scenario } from "./cases.ts";
import { runGroundedWikiSearch, type GroundedSearchOutcome } from "../../lib/server/knowledge/wiki/grounded-search.ts";
import { isPlaceQuestionId } from "../../lib/server/knowledge/claim/questions.ts";
import type { KnowledgeIntent } from "../../lib/server/knowledge/claim/intent.ts";
import { PROTOCOL_MODELS } from "../../lib/server/model-gateway/adapters/provider-protocol.ts";

/**
 * VPJ-76 (#360) slice 11: runs every frozen scenario (cases.ts) through the
 * real `runGroundedWikiSearch` -- fixture RPC/model transport, real
 * pipeline code, exactly this repo's established testing convention (every
 * other wiki-agentic-search test already works this way). No live model
 * or database credential is configured in any environment, so this is
 * explicitly `mode: "fixture"`, matching the VPJ-66 harness's own honesty
 * convention (evals/harness/harness.evals.test.ts) -- usage/latency here
 * measure this mechanism's own real code path, not real network or model
 * behavior. A real-model pass, when JT authorizes spending the configured
 * key's budget, is a deliberate, separate follow-up (see this eval's
 * README).
 */

const outputDirectory = new URL("../../artifacts/VPJ-76/wiki-frozen-eval-20260915/", import.meta.url);
const provider = Object.freeze({ provider: "qwen", endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", configurationId: "11111111-1111-1111-1111-111111111111", configurationVersion: 1, timeoutMs: 5000 });
const deps = Object.freeze({ credential: () => "fixture-key", recordDestination: async () => {} });

function chatResponse(content: unknown) {
  return Response.json({ model: PROTOCOL_MODELS[provider.provider], choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(content) } }], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } });
}

function knowledgeReadResponse(scenario: Scenario) {
  return {
    schemaVersion: "knowledge-read/1", evaluatedAt: "2026-09-15T00:00:00Z",
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

function sceneFor(questionId: string): string {
  if (questionId === "rail_boarding_documents") return "rail";
  if (questionId.startsWith("payment_")) return "payment";
  if (questionId.startsWith("connectivity_")) return "connectivity";
  return "attraction";
}

function intentFor(scenario: Scenario): KnowledgeIntent {
  return isPlaceQuestionId(scenario.questionId)
    ? { intent: scenario.questionId as never, requestScope: "single", placeName: "Synthetic Landmark", unansweredNeeds: [] }
    : { intent: scenario.questionId as never, requestScope: "single" };
}

function fetchFor(scenario: Scenario): typeof globalThis.fetch {
  if (scenario.kind === "missing_content") return (async () => { throw new Error("must not call: corpus is empty, this is a short-circuit"); }) as typeof globalThis.fetch;
  if (scenario.kind === "provider_failure") return (async () => new Response("", { status: 500 })) as typeof globalThis.fetch;
  if (scenario.kind === "budget_exhausted") {
    let round = 0;
    return (async () => { round += 1; return chatResponse({ action: "search", query: `attempt ${round}` }); }) as typeof globalThis.fetch;
  }
  const cited = scenario.corpus.filter((entry) => scenario.citedFactIds.includes(entry.factId));
  const citations = cited.map((entry) => ({ pageKey: entry.factId, quote: entry.text[scenario.locale].slice(0, 60) }));
  const coverage = scenario.kind === "retrieval_miss" ? "no_content" : citations.length === scenario.corpus.length ? "answered" : "partial";
  const summary = scenario.locale === "zh" ? "已根据引用信息作答。" : "Answered from the cited evidence.";
  const gaps = coverage === "partial" ? [scenario.locale === "zh" ? "部分要求尚未在已发布信息中找到。" : "Some requirements were not found in published information."] : [];
  return (async () => chatResponse({ action: "answer", coverage, summary, citations, gaps, conflicts: [] })) as typeof globalThis.fetch;
}

type Row = Readonly<{
  id: string; group: string; questionId: string; locale: string; kind: string;
  outcomeKind: string; reason?: string; requiredCovered: number; requiredTotal: number;
  structuredBaselineWouldAnswer: boolean; divergesFromBaseline: boolean; matchesExpected: boolean;
  elapsedMs: number; usageTotalTokens: number;
}>;

test("34 frozen scenarios cover every real question definition (zh+en) plus every non-gate terminal, split development/holdout without overlap", () => {
  assert.equal(scenarios.length, 34);
  assert.equal(new Set(scenarios.map((s) => s.id)).size, 34, "no duplicate scenario ids");
  const byGroup = { development: scenarios.filter((s) => s.group === "development").length, holdout: scenarios.filter((s) => s.group === "holdout").length };
  assert.ok(byGroup.development >= 14 && byGroup.holdout >= 14, `expected a roughly even split, got ${JSON.stringify(byGroup)}`);
  for (const questionId of ["rail_boarding_documents", "payment_card_acceptance", "payment_mobile_setup", "payment_cash_access", "payment_card_and_mobile", "payment_card_and_cash", "payment_mobile_and_cash", "payment_getting_started", "connectivity_sim_documents", "connectivity_plan_allowances", "connectivity_getting_started", "place_address", "place_opening_hours", "place_address_and_hours"]) {
    assert.ok(scenarios.some((s) => s.questionId === questionId && s.locale === "zh"), `missing zh case for ${questionId}`);
    assert.ok(scenarios.some((s) => s.questionId === questionId && s.locale === "en"), `missing en case for ${questionId}`);
  }
});

test("real pipeline run over the frozen set: every scenario's outcome matches its ground truth, and the report is written", async () => {
  const rows: Row[] = [];
  for (const scenario of scenarios) {
    const rpc = async () => ({ data: knowledgeReadResponse(scenario), error: null });
    const input = { intent: intentFor(scenario), question: scenario.question, city: scenario.city, locale: scenario.locale, maxRounds: 2, maxOutputTokens: 300, timeoutMs: 5000, provider };
    const started = performance.now();
    const outcome: GroundedSearchOutcome = await runGroundedWikiSearch(input, { ...deps, rpc, fetch: fetchFor(scenario) }, new AbortController().signal);
    const elapsedMs = performance.now() - started;

    const kindMatches = outcome.kind === scenario.expected.kind;
    const reasonMatches = !(outcome.kind === "unavailable" && scenario.expected.reason) || outcome.reason === scenario.expected.reason;
    let requiredCovered = 0;
    let coverageMatches = true;
    if (outcome.kind === "answered") {
      requiredCovered = outcome.evidence.required.filter((c) => c.status === "covered").length;
      if (scenario.kind === "full_coverage" && scenario.claims.length > 0) coverageMatches = requiredCovered === scenario.claims.length;
    }
    const matchesExpected = kindMatches && reasonMatches && coverageMatches;
    assert.equal(outcome.kind, scenario.expected.kind, `${scenario.id}: expected kind ${scenario.expected.kind}, got ${outcome.kind}`);
    assert.ok(reasonMatches, `${scenario.id}: expected reason ${scenario.expected.reason}, got ${outcome.kind === "unavailable" ? outcome.reason : "n/a"}`);
    assert.ok(coverageMatches, `${scenario.id}: full_coverage scenario should cover every required claim (${requiredCovered}/${scenario.claims.length})`);
    // Structured/direct-lookup baseline (VPJ-76 acceptance: "记录同批结构化/直接读取baseline和本路径实测差异"):
    // knowledge_read_v1 already scoped the corpus before this module ever runs, so a
    // direct lookup (no search, no model) would trivially "find" anything present in
    // it. The real, meaningful comparison is whether the agentic search loop actually
    // reaches that same content -- retrieval_miss and budget_exhausted are exactly the
    // two terminals where a non-empty, correctly-scoped corpus existed yet the agentic
    // path did not answer from it.
    const structuredBaselineWouldAnswer = scenario.corpus.length > 0;
    const divergesFromBaseline = structuredBaselineWouldAnswer && outcome.kind !== "answered";
    if (scenario.kind === "retrieval_miss" || scenario.kind === "budget_exhausted") {
      assert.ok(divergesFromBaseline, `${scenario.id}: this scenario exists specifically to exercise a baseline/agentic divergence`);
    }
    rows.push({
      id: scenario.id, group: scenario.group, questionId: scenario.questionId, locale: scenario.locale, kind: scenario.kind,
      outcomeKind: outcome.kind, reason: outcome.kind === "unavailable" ? outcome.reason : undefined,
      requiredCovered, requiredTotal: scenario.claims.length,
      structuredBaselineWouldAnswer, divergesFromBaseline, matchesExpected,
      elapsedMs: Math.round(elapsedMs * 1000) / 1000,
      usageTotalTokens: "usage" in outcome ? outcome.usage.totalTokens : 0,
    });
  }

  const answered = rows.filter((r) => r.outcomeKind === "answered");
  const attempted = rows.filter((r) => r.kind !== "missing_content"); // missing_content is a deliberate empty-corpus short-circuit, not a retrieval attempt
  const overRefused = rows.filter((r) => r.divergesFromBaseline);
  const sortedElapsed = [...rows.map((r) => r.elapsedMs)].sort((a, b) => a - b);
  const percentile = (p: number) => sortedElapsed[Math.min(sortedElapsed.length - 1, Math.floor((p / 100) * sortedElapsed.length))];
  const coverageRate = Math.round((answered.length / attempted.length) * 1000) / 10;
  const overRefusalRate = Math.round((overRefused.length / attempted.length) * 1000) / 10;
  const totalTokens = rows.reduce((sum, r) => sum + r.usageTotalTokens, 0);

  let commit = "unknown";
  try { commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: new URL("../../", import.meta.url), encoding: "utf8" }).trim(); } catch { /* an exported source tree has no commit */ }

  const report = {
    schemaVersion: 1, versions, commit, mode: "fixture" as const,
    note: "Fixture transport: elapsedMs measures this real code path's own overhead (parsing, validation, corpus scoring), not real network/model latency. usageTotalTokens is the fixture responses' declared usage, not a real bill. A real-model pass is a deliberate, separate follow-up -- see this eval's README.",
    counts: { total: rows.length, development: rows.filter((r) => r.group === "development").length, holdout: rows.filter((r) => r.group === "holdout").length, answered: answered.length, unavailable: rows.filter((r) => r.outcomeKind === "unavailable").length, budgetExhausted: rows.filter((r) => r.outcomeKind === "budget_exhausted").length },
    metrics: { coverageRatePercent: coverageRate, overRefusalRatePercent: overRefusalRate, p50ElapsedMs: percentile(50), p95ElapsedMs: percentile(95), totalTokens },
    baselineDivergence: rows.filter((r) => r.divergesFromBaseline).map((r) => ({ id: r.id, questionId: r.questionId, locale: r.locale, kind: r.kind, outcomeKind: r.outcomeKind })),
    rows,
    verdict: rows.every((r) => r.matchesExpected) ? "PASS" : "FAIL",
  };
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(new URL("results.json", outputDirectory), `${JSON.stringify(report, null, 2)}\n`);
  const zh = rows.filter((r) => r.locale === "zh").length, en = rows.filter((r) => r.locale === "en").length;
  writeFileSync(new URL("summary.md", outputDirectory), `# VPJ-76 冻结评测集（fixture 模式）\n\n34 个场景：中文${zh}条，英文${en}条；development ${report.counts.development}条，holdout ${report.counts.holdout}条。\n\n覆盖率 ${coverageRate}%，过拒答率 ${overRefusalRate}%（相对同批结构化/直接读取baseline，共${overRefused.length}条分歧，均为刻意构造的 retrieval_miss/budget_exhausted 场景）。p50 ${percentile(50)}ms / p95 ${percentile(95)}ms（fixture transport，非真实网络/模型延迟）。累计 usage token：${totalTokens}（fixture声明值，非真实计费）。\n\n判定：${report.verdict}。真实模型/真实数据库一轮尚未做，见本目录 README。\n\n${rows.map((r) => `- ${r.id} [${r.group}]: ${r.kind} → ${r.outcomeKind}${r.reason ? "/" + r.reason : ""}${r.requiredTotal ? ` (covered ${r.requiredCovered}/${r.requiredTotal})` : ""}`).join("\n")}\n`);
  assert.equal(report.verdict, "PASS");
});
