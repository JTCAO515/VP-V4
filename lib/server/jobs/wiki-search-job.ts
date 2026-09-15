import { randomUUID } from "node:crypto";
import { CostGuard } from "../model-gateway/budget/index.ts";
import { invokeProviderProtocol, type ProtocolProvider } from "../model-gateway/adapters/provider-protocol.ts";
import { createProviderHttpTransport, type HttpProviderConfiguration, type HttpTransportDependencies } from "../model-gateway/adapters/http-transport.ts";
import type { WikiSearchAction, WikiSearchCitation } from "../model-gateway/prompt/wiki-search.ts";
import { searchWikiCorpus, type WikiSearchCorpusEntry, type WikiSearchHit } from "../knowledge/wiki/search-index.ts";

/**
 * VPJ-76 (#360) probe scope: the agentic search loop itself. Each round is
 * one independent invokeProviderProtocol call sharing the same CostGuard
 * turn (so maxModelSteps bounds total rounds, not just one call); the model
 * decides whether to search again or answer. This module never writes to
 * the database and never publishes anything -- it is a read-only query
 * over a caller-supplied corpus of already-published Wiki text, returned
 * directly to whatever calls it. Separate from wiki-generation-job.ts
 * (writes new Wiki drafts) and wiki-statement-proposal-job.ts (writes
 * statement proposals); this job produces nothing durable.
 */

export type WikiSearchJobInput = Readonly<{
  question: string;
  locale: "zh" | "en";
  corpus: readonly WikiSearchCorpusEntry[];
  maxRounds: number;
  maxOutputTokens: number;
  timeoutMs: number;
  provider: HttpProviderConfiguration;
}>;

export type WikiSearchJobUsage = Readonly<{ inputTokens: number; outputTokens: number; totalTokens: number }>;

export type WikiSearchJobOutcome =
  | Readonly<{
      kind: "answered";
      coverage: "answered" | "partial" | "no_content";
      summary: string;
      citations: readonly WikiSearchCitation[];
      gaps: readonly string[];
      rounds: number;
      queries: readonly string[];
      usage: WikiSearchJobUsage;
    }>
  | Readonly<{ kind: "budget_exhausted"; rounds: number; queries: readonly string[]; usage: WikiSearchJobUsage }>
  | Readonly<{ kind: "failed"; errorCode: string; rounds: number; usage: WikiSearchJobUsage }>
  | Readonly<{ kind: "cancelled"; rounds: number; usage: WikiSearchJobUsage }>;

export type WikiSearchJobDependencies = Readonly<{
  credential: HttpTransportDependencies["credential"];
  recordDestination: HttpTransportDependencies["recordDestination"];
  fetch?: typeof globalThis.fetch;
}>;

const MAX_EVIDENCE_PER_ROUND = 3;
const MAX_ROUNDS_IN_TRANSCRIPT = 4;
const EVIDENCE_TEXT_EXCERPT = 500;
const MAX_PROMPT_LENGTH = 24000;

type RoundLog = Readonly<{ query: string; duplicate: boolean; hits: readonly WikiSearchHit[]; novel: boolean }>;

function validInput(value: WikiSearchJobInput): boolean {
  return !!value && typeof value === "object"
    && typeof value.question === "string" && value.question.trim().length > 0 && value.question.length <= 2000
    && (value.locale === "zh" || value.locale === "en")
    && Array.isArray(value.corpus)
    && Number.isSafeInteger(value.maxRounds) && value.maxRounds >= 1 && value.maxRounds <= 6
    && Number.isSafeInteger(value.maxOutputTokens) && value.maxOutputTokens > 0 && value.maxOutputTokens <= 4096
    && Number.isSafeInteger(value.timeoutMs) && value.timeoutMs > 0 && value.timeoutMs <= 60000
    && !!value.provider && (value.provider as HttpProviderConfiguration).provider !== undefined;
}

export async function runWikiSearchJob(
  input: WikiSearchJobInput, dependencies: WikiSearchJobDependencies, signal: AbortSignal,
): Promise<WikiSearchJobOutcome> {
  const zeroUsage: WikiSearchJobUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  if (!validInput(input)) return { kind: "failed", errorCode: "INVALID_INPUT", rounds: 0, usage: zeroUsage };
  if (signal.aborted) return { kind: "cancelled", rounds: 0, usage: zeroUsage };

  const guard = new CostGuard({ windowMs: 60000, perUserAttempts: 20, perTaskAttempts: input.maxRounds, turnDeadlineMs: input.timeoutMs * input.maxRounds, maxModelSteps: input.maxRounds, maxToolSteps: 1 });
  const taskId = randomUUID();
  const turn = guard.startTurn({ userId: "wiki-search-worker", taskId });
  if (turn.kind !== "turn") return { kind: "failed", errorCode: "INVALID_INPUT", rounds: 0, usage: zeroUsage };

  const transport = createProviderHttpTransport(input.provider, {
    credential: dependencies.credential, recordDestination: dependencies.recordDestination,
    ...(dependencies.fetch ? { fetch: dependencies.fetch } : {}),
  });

  const seenQueries = new Set<string>();
  const orderedQueries: string[] = [];
  const seenPageKeys = new Set<string>();
  const rounds: RoundLog[] = [];
  const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  for (let round = 1; round <= input.maxRounds; round += 1) {
    if (signal.aborted) return { kind: "cancelled", rounds: round - 1, usage };
    const prompt = buildRoundPrompt(input.question, input.locale, rounds, round === input.maxRounds);
    const outcome = await invokeProviderProtocol(
      { requestId: randomUUID(), provider: input.provider.provider, dataClass: "c0_synthetic", input: prompt, task: "wiki_search_v1", maxOutputTokens: input.maxOutputTokens, timeoutMs: input.timeoutMs },
      turn, transport, signal,
    );
    if (outcome.kind === "cancelled") return { kind: "cancelled", rounds: round - 1, usage };
    if (outcome.kind === "unavailable") {
      if (outcome.usage) addUsage(usage, outcome.usage);
      return outcome.code === "BUDGET_EXHAUSTED"
        ? { kind: "budget_exhausted", rounds: round - 1, queries: orderedQueries, usage }
        : { kind: "failed", errorCode: outcome.code, rounds: round - 1, usage };
    }
    addUsage(usage, outcome.usage);
    const action = outcome.output as WikiSearchAction;
    if (action.action === "answer") {
      return { kind: "answered", coverage: action.coverage, summary: action.summary, citations: action.citations, gaps: action.gaps, rounds: round, queries: orderedQueries, usage };
    }
    const normalizedQuery = action.query.trim();
    const duplicate = seenQueries.has(normalizedQuery.toLowerCase());
    if (!duplicate) { seenQueries.add(normalizedQuery.toLowerCase()); orderedQueries.push(normalizedQuery); }
    const hits = duplicate ? [] : searchWikiCorpus(input.corpus, normalizedQuery, MAX_EVIDENCE_PER_ROUND);
    // Distinct from `duplicate` (identical query string): a *rephrased*
    // query that still surfaces zero pageKeys not already seen in an
    // earlier round -- the real failure mode a live GLM probe hit
    // (VPJ-76, wiki-real-model-probe-20260915), where the model kept
    // varying its Chinese wording each round without ever landing on a
    // query the model itself would recognize as "the same," so the
    // duplicate check never fired and it never converged on an answer.
    const novel = hits.some((hit) => !seenPageKeys.has(hit.pageKey));
    hits.forEach((hit) => seenPageKeys.add(hit.pageKey));
    rounds.push({ query: normalizedQuery, duplicate, hits, novel });
  }
  return { kind: "budget_exhausted", rounds: input.maxRounds, queries: orderedQueries, usage };
}

function addUsage(total: { inputTokens: number; outputTokens: number; totalTokens: number }, usage: Readonly<{ inputTokens: number; outputTokens: number; totalTokens: number }>): void {
  total.inputTokens += usage.inputTokens; total.outputTokens += usage.outputTokens; total.totalTokens += usage.totalTokens;
}

function buildRoundPrompt(question: string, locale: "zh" | "en", rounds: readonly RoundLog[], isFinalRound: boolean): string {
  const lines: string[] = [`Traveler's question (locale: ${locale}): ${JSON.stringify(question)}`];
  const recent = rounds.slice(-MAX_ROUNDS_IN_TRANSCRIPT);
  if (rounds.length > recent.length) lines.push(`(${rounds.length - recent.length} earlier round(s) omitted from this transcript; do not repeat their queries.)`);
  recent.forEach((entry, index) => {
    const roundNumber = rounds.length - recent.length + index + 1;
    if (entry.duplicate) {
      lines.push(`Round ${roundNumber} search: query=${JSON.stringify(entry.query)} -- duplicate of an earlier query in this session, no new search was run.`);
    } else if (entry.hits.length === 0) {
      lines.push(`Round ${roundNumber} search: query=${JSON.stringify(entry.query)} -- no results found.`);
    } else if (!entry.novel) {
      lines.push(`Round ${roundNumber} search: query=${JSON.stringify(entry.query)} -- every result was already surfaced by an earlier round's search, nothing new here even though the query wording differs:`);
      entry.hits.forEach((hit, hitIndex) => {
        lines.push(`  [${hitIndex + 1}] pageKey=${hit.pageKey}: ${excerpt(hit.text)}`);
      });
    } else {
      lines.push(`Round ${roundNumber} search: query=${JSON.stringify(entry.query)} -- results:`);
      entry.hits.forEach((hit, hitIndex) => {
        lines.push(`  [${hitIndex + 1}] pageKey=${hit.pageKey}: ${excerpt(hit.text)}`);
      });
    }
  });
  const lastRoundHadNoNewEvidence = rounds.length > 0 && !rounds[rounds.length - 1].novel;
  if (isFinalRound) {
    lines.push("This is your final round -- there is no round after this one. Rephrasing the query again risks running out of rounds without ever answering the traveler at all. Strongly prefer answering now (coverage \"partial\" or \"no_content\" is an honest, complete answer; running out of rounds is not) over one more search.");
  } else if (lastRoundHadNoNewEvidence) {
    lines.push("Your last search (even with different wording) surfaced no page you haven't already seen. Rephrasing again is unlikely to help -- consider answering now with what you have, rather than continuing to vary the query.");
  } else {
    lines.push(rounds.length === 0
      ? "Decide: search first, or answer now only if you are certain no search is needed."
      : "Decide: search again with a new query, or give your final answer now.");
  }
  const prompt = lines.join("\n");
  return prompt.length > MAX_PROMPT_LENGTH ? prompt.slice(0, MAX_PROMPT_LENGTH) : prompt;
}

function excerpt(text: string): string {
  return text.length > EVIDENCE_TEXT_EXCERPT ? text.slice(0, EVIDENCE_TEXT_EXCERPT) + "..." : text;
}
