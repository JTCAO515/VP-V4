import { questionDefinition, isPlaceQuestionId } from "../claim/questions.ts";
import type { KnowledgeIntent } from "../claim/intent.ts";
import { buildPublishedWikiCorpus, type KnowledgeReadRpc } from "./published-corpus.ts";
import { runWikiSearchJob, type WikiSearchJobDependencies } from "../../jobs/wiki-search-job.ts";
import type { WikiSearchCitation } from "../../model-gateway/prompt/wiki-search.ts";
import type { HttpProviderConfiguration } from "../../model-gateway/adapters/http-transport.ts";

/**
 * VPJ-76 (#360) slice 3: the glue between an already-recognized
 * KnowledgeIntent (the existing knowledge_intent_v1 path -- not
 * re-implemented here) and the agentic search loop. Turns
 * {intent, city, locale} into the {city, scene, locale} scope
 * buildPublishedWikiCorpus needs, short-circuits before spending a model
 * call when there is nothing published to search, and otherwise runs the
 * loop.
 *
 * Place questions (place_address / place_opening_hours /
 * place_address_and_hours) ARE supported (slice 6), despite needing a
 * resolved placeSubjectId for questionDefinition()'s own claims-coverage
 * path (grounded-turn/1, a different and stricter consumer) -- this
 * module only needs the *scene* ("attraction", hardcoded for every place
 * question in questionDefinition() regardless of subjectId), not a
 * resolved subject, because the search loop finds the relevant published
 * content itself rather than requiring it be pre-identified. See slice 6
 * in docs/contracts/wiki-agentic-search.md for the reasoning. city comes
 * from the caller's existing Trip context, never from free-text
 * recognition.
 *
 * Slice 4: every non-answered terminal collapses into VPJ-76's own
 * required six-way reason taxonomy (missing_content / retrieval_miss /
 * user_input_missing / capability_unsupported / policy_denied /
 * provider_failure), rather than the ad-hoc kinds slice 3 shipped with
 * (unsupported_intent / no_content / corpus_unavailable). This is a
 * deliberate breaking change to a type this session introduced two
 * commits ago -- nothing outside this session's own three slices calls
 * runGroundedWikiSearch yet, so there is no real caller to break.
 */

export type GroundedSearchInput = Readonly<{
  intent: KnowledgeIntent;
  question: string;
  city: string;
  locale: "zh" | "en";
  maxRounds: number;
  maxOutputTokens: number;
  timeoutMs: number;
  provider: HttpProviderConfiguration;
}>;

export type GroundedSearchReasonCode = "missing_content" | "retrieval_miss" | "user_input_missing" | "capability_unsupported" | "policy_denied" | "provider_failure";
export type GroundedSearchUsage = Readonly<{ inputTokens: number; outputTokens: number; totalTokens: number }>;

export type GroundedSearchOutcome =
  | Readonly<{
      kind: "answered";
      coverage: "answered" | "partial";
      summary: string;
      citations: readonly WikiSearchCitation[];
      gaps: readonly string[];
      rounds: number;
      queries: readonly string[];
      usage: GroundedSearchUsage;
    }>
  | Readonly<{ kind: "unavailable"; reason: GroundedSearchReasonCode; providerCode?: string }>
  | Readonly<{ kind: "budget_exhausted"; rounds: number; queries: readonly string[]; usage: GroundedSearchUsage }>
  | Readonly<{ kind: "cancelled"; rounds: number; usage: GroundedSearchUsage }>;

export type GroundedSearchDependencies = WikiSearchJobDependencies & Readonly<{ rpc: KnowledgeReadRpc }>;

const zeroUsage: GroundedSearchUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

export async function runGroundedWikiSearch(
  input: GroundedSearchInput, dependencies: GroundedSearchDependencies, signal: AbortSignal,
): Promise<GroundedSearchOutcome> {
  // clarification means the traveler's own input didn't give the intent
  // classifier enough to work with; unsupported means this capability
  // doesn't cover that kind of question at all -- two different reasons,
  // not one generic "can't handle this".
  if (input.intent.intent === "clarification") return { kind: "unavailable", reason: "user_input_missing" };
  // Place questions bypass questionDefinition() entirely: that function
  // requires a resolved placeSubjectId (for grounded-turn/1's own
  // claims-coverage checks) and returns null without one, but the scene it
  // would return is a hardcoded "attraction" regardless of subjectId --
  // the only piece this module actually needs.
  const scene = isPlaceQuestionId(input.intent.intent) ? "attraction" : questionDefinition(input.intent.intent)?.scene;
  if (!scene) return { kind: "unavailable", reason: "capability_unsupported" };

  const corpusOutcome = await buildPublishedWikiCorpus(dependencies.rpc, { city: input.city, scene, locale: input.locale });
  if (corpusOutcome.kind === "unavailable") {
    return { kind: "unavailable", reason: corpusOutcome.code === "KNOWLEDGE_DISABLED" ? "policy_denied" : "provider_failure", providerCode: corpusOutcome.code };
  }
  if (corpusOutcome.entries.length === 0) return { kind: "unavailable", reason: "missing_content" };

  const outcome = await runWikiSearchJob(
    { question: input.question, locale: input.locale, corpus: corpusOutcome.entries, maxRounds: input.maxRounds, maxOutputTokens: input.maxOutputTokens, timeoutMs: input.timeoutMs, provider: input.provider },
    dependencies, signal,
  );
  switch (outcome.kind) {
    case "answered":
      // Real content existed (corpus was non-empty) but the search loop
      // itself came up empty -- that's a retrieval miss, not "no content
      // exists" (missing_content) and not a real answer (empty citations).
      return outcome.coverage === "no_content"
        ? { kind: "unavailable", reason: "retrieval_miss" }
        : { kind: "answered", coverage: outcome.coverage, summary: outcome.summary, citations: outcome.citations, gaps: outcome.gaps, rounds: outcome.rounds, queries: outcome.queries, usage: outcome.usage };
    case "budget_exhausted":
      return { kind: "budget_exhausted", rounds: outcome.rounds, queries: outcome.queries, usage: outcome.usage };
    case "cancelled":
      return { kind: "cancelled", rounds: outcome.rounds, usage: zeroUsage };
    case "failed":
      return { kind: "unavailable", reason: "provider_failure", providerCode: outcome.errorCode };
  }
}
