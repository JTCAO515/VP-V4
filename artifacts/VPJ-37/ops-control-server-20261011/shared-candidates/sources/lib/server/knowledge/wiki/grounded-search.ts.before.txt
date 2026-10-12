import { questionDefinition, isPlaceQuestionId } from "../claim/questions.ts";
import type { KnowledgeIntent } from "../claim/intent.ts";
import { buildPublishedWikiCorpus, type KnowledgeReadRpc } from "./published-corpus.ts";
import { runWikiSearchJob, type WikiSearchJobDependencies } from "../../jobs/wiki-search-job.ts";
import type { WikiSearchCitation } from "../../model-gateway/prompt/wiki-search.ts";
import type { HttpProviderConfiguration } from "../../model-gateway/adapters/http-transport.ts";
import { buildEvidencePack, type EvidencePack } from "./evidence-pack.ts";

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
      conflicts: readonly string[];
      evidence: EvidencePack;
      rounds: number;
      queries: readonly string[];
      usage: GroundedSearchUsage;
    }>
  | Readonly<{ kind: "unavailable"; reason: GroundedSearchReasonCode; providerCode?: string }>
  | Readonly<{ kind: "budget_exhausted"; rounds: number; queries: readonly string[]; usage: GroundedSearchUsage }>
  | Readonly<{ kind: "cancelled"; rounds: number; usage: GroundedSearchUsage }>;

export type GroundedSearchDependencies = WikiSearchJobDependencies & Readonly<{ rpc: KnowledgeReadRpc }>;

const zeroUsage: GroundedSearchUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

/** Mirrors wiki-search-job.ts's own hard bound on maxRounds (validInput: 1-6). Kept here,
 * not imported, so this stays a pure value with no cross-module coupling beyond the number. */
const HARD_MAX_ROUNDS = 6;

/**
 * VPJ-76 (#360) recommended follow-up, named explicitly in
 * wiki-frozen-eval-real-model-20260916/verification.md: a flat `maxRounds`
 * regardless of how many required claims a question has caused real
 * under-coverage in that real-model pass -- 3 of 11 mismatches were
 * multi-claim questions (e.g. payment_getting_started's 4 claims) that ran
 * out of rounds before covering every required claim, under every caller's
 * flat `maxRounds: 2` (both `scripts/eval/run-wiki-agentic-real-model.mjs`
 * and the frozen eval harness use that same fixed value). This never
 * lowers what a caller explicitly requested (a single-claim question keeps
 * its caller's existing budget unchanged) and never exceeds
 * runWikiSearchJob's own independently-enforced hard bound. Place
 * questions (requiredClaimCount 0, since this module never resolves a
 * placeSubjectId -- see the EvidencePack comment above) are unaffected,
 * matching that existing scope decision.
 */
export function tunedMaxRounds(requestedMaxRounds: number, requiredClaimCount: number): number {
  return Math.max(requestedMaxRounds, Math.min(HARD_MAX_ROUNDS, requiredClaimCount + 1));
}

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
  // Required-claim coverage (EvidencePack v2) needs a fixed claim set. Place
  // questions have none here -- their claims are only resolvable once a
  // subject is chosen, which (per the comment above) this module never
  // does; their EvidencePack.required stays empty, matching that same
  // existing scope decision rather than inventing subject resolution here.
  const isPlace = isPlaceQuestionId(input.intent.intent);
  const definition = isPlace ? null : questionDefinition(input.intent.intent);
  const scene = isPlace ? "attraction" : definition?.scene;
  if (!scene) return { kind: "unavailable", reason: "capability_unsupported" };

  const corpusOutcome = await buildPublishedWikiCorpus(dependencies.rpc, { city: input.city, scene, locale: input.locale });
  if (corpusOutcome.kind === "unavailable") {
    return { kind: "unavailable", reason: corpusOutcome.code === "KNOWLEDGE_DISABLED" ? "policy_denied" : "provider_failure", providerCode: corpusOutcome.code };
  }
  if (corpusOutcome.entries.length === 0) return { kind: "unavailable", reason: "missing_content" };

  const requiredClaimCount = definition?.claims.length ?? 0;
  const outcome = await runWikiSearchJob(
    { question: input.question, locale: input.locale, corpus: corpusOutcome.entries, maxRounds: tunedMaxRounds(input.maxRounds, requiredClaimCount), maxOutputTokens: input.maxOutputTokens, timeoutMs: input.timeoutMs, provider: input.provider },
    dependencies, signal,
  );
  switch (outcome.kind) {
    case "answered":
      // Real content existed (corpus was non-empty) but the search loop
      // itself came up empty -- that's a retrieval miss, not "no content
      // exists" (missing_content) and not a real answer (empty citations).
      if (outcome.coverage === "no_content") return { kind: "unavailable", reason: "retrieval_miss" };
      return {
        kind: "answered", coverage: outcome.coverage, summary: outcome.summary, citations: outcome.citations, gaps: outcome.gaps, conflicts: outcome.conflicts,
        evidence: buildEvidencePack(outcome.citations, corpusOutcome.provenance, definition?.claims ?? [], outcome.gaps, outcome.conflicts),
        rounds: outcome.rounds, queries: outcome.queries, usage: outcome.usage,
      };
    case "budget_exhausted":
      return { kind: "budget_exhausted", rounds: outcome.rounds, queries: outcome.queries, usage: outcome.usage };
    case "cancelled":
      return { kind: "cancelled", rounds: outcome.rounds, usage: zeroUsage };
    case "failed":
      return { kind: "unavailable", reason: "provider_failure", providerCode: outcome.errorCode };
  }
}
