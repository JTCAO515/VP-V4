import { questionDefinition } from "../claim/questions.ts";
import type { KnowledgeIntent } from "../claim/intent.ts";
import { buildPublishedWikiCorpus, type KnowledgeReadRpc } from "./published-corpus.ts";
import { runWikiSearchJob, type WikiSearchJobDependencies, type WikiSearchJobOutcome } from "../../jobs/wiki-search-job.ts";
import type { HttpProviderConfiguration } from "../../model-gateway/adapters/http-transport.ts";

/**
 * VPJ-76 (#360) slice 3: the glue between an already-recognized
 * KnowledgeIntent (the existing knowledge_intent_v1 path -- not
 * re-implemented here) and the agentic search loop. Turns
 * {intent, city, locale} into the {city, scene, locale} scope
 * buildPublishedWikiCorpus needs, short-circuits to "no_content" before
 * spending a model call when there is nothing published to search, and
 * otherwise runs the loop.
 *
 * Place questions (place_address / place_opening_hours /
 * place_address_and_hours) need a resolved placeSubjectId from place
 * disambiguation (VPJ-19), which this module does not perform --
 * unsupported_intent for those until a caller supplies one is out of
 * scope for this slice. city comes from the caller's existing Trip
 * context, never from free-text recognition.
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

export type GroundedSearchOutcome =
  | WikiSearchJobOutcome
  | Readonly<{ kind: "unsupported_intent" }>
  | Readonly<{ kind: "no_content" }>
  | Readonly<{ kind: "corpus_unavailable"; code: string }>;

export type GroundedSearchDependencies = WikiSearchJobDependencies & Readonly<{ rpc: KnowledgeReadRpc }>;

export async function runGroundedWikiSearch(
  input: GroundedSearchInput, dependencies: GroundedSearchDependencies, signal: AbortSignal,
): Promise<GroundedSearchOutcome> {
  const definition = questionDefinition(input.intent.intent);
  if (!definition) return { kind: "unsupported_intent" };

  const corpusOutcome = await buildPublishedWikiCorpus(dependencies.rpc, { city: input.city, scene: definition.scene, locale: input.locale });
  if (corpusOutcome.kind === "unavailable") return { kind: "corpus_unavailable", code: corpusOutcome.code };
  if (corpusOutcome.entries.length === 0) return { kind: "no_content" };

  return runWikiSearchJob(
    { question: input.question, locale: input.locale, corpus: corpusOutcome.entries, maxRounds: input.maxRounds, maxOutputTokens: input.maxOutputTokens, timeoutMs: input.timeoutMs, provider: input.provider },
    dependencies, signal,
  );
}
