import { questionDefinition, isPlaceQuestionId } from "../claim/questions.ts";
import type { KnowledgeIntent } from "../claim/intent.ts";
import { buildPublishedWikiCorpus, type KnowledgeReadRpc, type PublishedCorpusOutcome } from "./published-corpus.ts";
import { runWikiSearchJob, type WikiSearchJobDependencies, type WikiSearchJobOutcome } from "../../jobs/wiki-search-job.ts";
import type { WikiSearchCitation } from "../../model-gateway/prompt/wiki-search.ts";
import type { HttpProviderConfiguration } from "../../model-gateway/adapters/http-transport.ts";
import { buildEvidencePack, type EvidencePack } from "./evidence-pack.ts";

/** Published Wiki search with server-owned obligation coverage and a current
 * evidence gate for display text. Place coverage requires an explicitly supplied
 * first-party resolved placeSubjectId; a place name or a relevant hit is not
 * entity resolution. Existing reasons and consumer unions stay intact. */

export type GroundedSearchInput = Readonly<{
  intent: KnowledgeIntent;
  /** First-party resolver output only; never derived from model/name similarity. */
  placeSubjectId?: string;
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
 * runWikiSearchJob's own independently-enforced hard bound. An explicitly
 * resolved place subject supplies the place question's real required claims
 * and participates in the same tuning. Without that subject, the claim count
 * is zero and this module cannot assert an answered place result.
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
  // Preserve the scoped corpus read for place questions, but do not invent
  // the resolved subject required by questionDefinition's obligation set.
  const isPlace = isPlaceQuestionId(input.intent.intent);
  const definition = questionDefinition(input.intent.intent, input.placeSubjectId);
  const scene = isPlace ? "attraction" : definition?.scene;
  if (!scene) return { kind: "unavailable", reason: "capability_unsupported" };

  // The existing corpus adapter discards subjectId. Retain it locally from
  // the same authorized response; never infer an entity from model prose.
  let subjects = new Map<string, string>();
  let variants = new Map<string, string>();
  const scopedRpc: KnowledgeReadRpc = async (name, params) => {
    const reply = await dependencies.rpc(name, params);
    subjects = new Map();
    variants = new Map();
    const data = reply.data;
    if (data && typeof data === "object" && "statements" in data && Array.isArray(data.statements)) {
      for (const row of data.statements) {
        if (row && typeof row === "object" && typeof row.factId === "string"
          && row.assertion && typeof row.assertion.subjectId === "string") {
          subjects.set(row.factId, row.assertion.subjectId);
          variants.set(row.factId, projectionVariant(row));
        }
      }
    }
    return reply;
  };
  const corpusOutcome = await buildPublishedWikiCorpus(scopedRpc, { city: input.city, scene, locale: input.locale });
  const originalSubjects = subjects;
  const originalVariants = variants;
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
    case "answered": {
      return finalizeAnswer(input, signal, definition, scene, corpusOutcome, originalSubjects, originalVariants, scopedRpc, () => subjects, () => variants, outcome);
    }
    case "budget_exhausted":
      return { kind: "budget_exhausted", rounds: outcome.rounds, queries: outcome.queries, usage: outcome.usage };
    case "cancelled":
      return { kind: "cancelled", rounds: outcome.rounds, usage: zeroUsage };
    case "failed":
      return { kind: "unavailable", reason: "provider_failure", providerCode: outcome.errorCode };
  }
}

async function finalizeAnswer(
  input: GroundedSearchInput, signal: AbortSignal,
  definition: ReturnType<typeof questionDefinition>, scene: string,
  corpusOutcome: Extract<PublishedCorpusOutcome, { kind: "corpus" }>, originalSubjects: ReadonlyMap<string, string>,
  originalVariants: ReadonlyMap<string, string>,
  scopedRpc: KnowledgeReadRpc, currentSubjects: () => ReadonlyMap<string, string>,
  currentVariants: () => ReadonlyMap<string, string>,
  outcome: Extract<WikiSearchJobOutcome, { kind: "answered" }>, allowLookup = true,
): Promise<GroundedSearchOutcome> {
  if (signal.aborted) return { kind: "cancelled", rounds: outcome.rounds, usage: outcome.usage };
  // No resolved place subject or conflict-to-claim relation is exposed by
  // this port. Do not invent an obligation or choose a conflicting side.
  if (!definition) return { kind: "unavailable", reason: "user_input_missing" };
  const current = await buildPublishedWikiCorpus(scopedRpc, { city: input.city, scene, locale: input.locale });
  if (signal.aborted) return { kind: "cancelled", rounds: outcome.rounds, usage: outcome.usage };
  if (current.kind === "unavailable") return { kind: "unavailable", reason: current.code === "KNOWLEDGE_DISABLED" ? "policy_denied" : "provider_failure" };
  // A no-content proposal gets one bounded direct lookup of obligations,
  // so complete eligible evidence cannot be refused just by model choice.
  const lookup = corpusOutcome.entries.filter((entry) => {
    const prov = corpusOutcome.provenance.get(entry.pageKey);
    return entry.text.length < 4000 && definition.claims.some((claim) => prov
      && originalSubjects.get(entry.pageKey) === claim.subjectId
      && prov.predicate === claim.predicate && prov.objectId === claim.objectId);
  });
  // Reserve one match per obligation before extra sources; keep the original
  // eight-citation bound even when a no-content proposal needs direct lookup.
  const primary = definition.claims.flatMap((claim) => {
    const match = lookup.find((entry) => {
      const prov = corpusOutcome.provenance.get(entry.pageKey);
      return prov && originalSubjects.get(entry.pageKey) === claim.subjectId
        && prov.predicate === claim.predicate && prov.objectId === claim.objectId;
    });
    return match ? [match] : [];
  });
  const stillCurrent = (citation: WikiSearchCitation): boolean => {
    const previous = corpusOutcome.entries.find((entry) => entry.pageKey === citation.pageKey);
    const now = current.entries.find((entry) => entry.pageKey === citation.pageKey);
    const before = corpusOutcome.provenance.get(citation.pageKey);
    const after = current.provenance.get(citation.pageKey);
    return !!(previous && now && previous.text === now.text && before && after
      && originalSubjects.get(citation.pageKey) === currentSubjects().get(citation.pageKey)
      && originalVariants.get(citation.pageKey) === currentVariants().get(citation.pageKey)
      && before.publicationId === after.publicationId && before.predicate === after.predicate
      && before.objectId === after.objectId && JSON.stringify(before.sourceIds) === JSON.stringify(after.sourceIds));
  };
  // A free-text model disagreement cannot label a claim as conflicting.
  // Keep independently authorized statements and expose bounded uncertainty
  // without choosing one version or inventing a conflict resolver.
  const conflicts = outcome.conflicts.length ? [input.locale === "zh"
    ? "模型报告的分歧尚未定位到具体证据；请核对所列已发布资料。"
    : "Reported disagreement is not mapped to evidence; verify the listed published sources."] : [];
  // Reuse the resolver's unresolved_variants rule across the whole current
  // exact-obligation set, including evidence the model did not cite. Compare
  // the structured projection, not a semantic/NLP contradiction heuristic.
  // Missing full bilingual expressions/value cannot prove complete equality;
  // this gate detects distinctions observable in this authorized projection.
  const unresolved = new Set<string>();
  for (const claim of definition.claims) {
    const candidates = current.entries.filter((entry) => {
      const prov = current.provenance.get(entry.pageKey);
      return prov && currentSubjects().get(entry.pageKey) === claim.subjectId
        && prov.predicate === claim.predicate && prov.objectId === claim.objectId;
    });
    if (new Set(candidates.map((entry) => currentVariants().get(entry.pageKey))).size > 1) {
      candidates.forEach((entry) => unresolved.add(entry.pageKey));
      conflicts.push(input.locale === "zh" ? `存在未消歧的已发布证据变体：${claim.objectId}。`
        : `Unresolved published evidence variants: ${claim.objectId}.`);
    }
  }
  const modelHasRequired = outcome.citations.some((citation) => {
    const prov = current.provenance.get(citation.pageKey);
    return stillCurrent(citation) && !unresolved.has(citation.pageKey) && definition.claims.some((claim) => prov
      && currentSubjects().get(citation.pageKey) === claim.subjectId
      && prov.predicate === claim.predicate && prov.objectId === claim.objectId);
  });
  const proposed = allowLookup && (outcome.coverage === "no_content" || !modelHasRequired)
    ? [...new Map([...primary, ...lookup].map((entry) => [entry.pageKey, entry])).values()].slice(0, 8)
      .map((entry) => ({ pageKey: entry.pageKey, quote: entry.text }))
    : outcome.citations;
  const currentCitations = proposed.filter(stillCurrent);
  const citations = currentCitations.filter((citation) => !unresolved.has(citation.pageKey)).slice(0, 8);
  // Only exact triples can satisfy obligations. The public provenance
  // contract remains unchanged; background retains its separate refs.
  const requiredProvenance = new Map([...current.provenance].filter(([id, prov]) => definition.claims.some((claim) =>
    currentSubjects().get(id) === claim.subjectId && prov.predicate === claim.predicate && prov.objectId === claim.objectId)));
  const initialPack = buildEvidencePack(citations, requiredProvenance, definition.claims, [], conflicts);
  const coveredIds = new Set(initialPack.required.flatMap((claim) => claim.refs.map((ref) => ref.statementId)));
  if (coveredIds.size === 0) return { kind: "unavailable", reason: current.entries.length ? "retrieval_miss" : "missing_content" };
  const gaps = initialPack.required.filter((claim) => claim.status === "unresolved").map((claim) =>
    input.locale === "zh" ? `缺少获准证据：${claim.claimId}。请补充当前已发布资料。`
      : `Missing authorized evidence: ${claim.claimId}. Check current published information.`);
  if (outcome.conflicts.length) gaps.push(input.locale === "zh" ? "分歧涉及哪些要求尚不明确；请先核对已发布资料。"
    : "The affected obligations are unknown; verify published sources before relying on the answer.");
  const requiredPack = buildEvidencePack(citations, requiredProvenance, definition.claims, gaps, conflicts);
  const allPack = buildEvidencePack(citations, current.provenance, [], gaps, conflicts);
  const evidence: EvidencePack = { ...requiredPack, background: allPack.background.filter((ref) => !coveredIds.has(ref.statementId)) };
  // Reconstruct both display text and coverage from current evidence. A
  // model's claimed answer cannot bypass the card's required-claim gate.
  const summary = [...new Set(current.entries.filter((entry) => coveredIds.has(entry.pageKey)).map((entry) => entry.text))].join("\n");
  return {
    kind: "answered", coverage: gaps.length ? "partial" : "answered", summary, citations, gaps, conflicts, evidence,
    rounds: outcome.rounds, queries: outcome.queries, usage: outcome.usage,
  };
}

/** Recheck a persisted answer through the same final gate, without a model or write. */
export async function revalidateGroundedWikiSearchResult(
  input: GroundedSearchInput, outcome: Extract<GroundedSearchOutcome, { kind: "answered" }>,
  dependencies: GroundedSearchDependencies, signal: AbortSignal,
): Promise<GroundedSearchOutcome> {
  const definition = questionDefinition(input.intent.intent, input.placeSubjectId);
  if (!definition) return { kind: "unavailable", reason: "user_input_missing" };
  let subjects = new Map<string, string>();
  let variants = new Map<string, string>();
  const rpc: KnowledgeReadRpc = async (name, params) => {
    const reply = await dependencies.rpc(name, params);
    subjects = new Map();
    variants = new Map();
    if (reply.data && typeof reply.data === "object" && "statements" in reply.data && Array.isArray(reply.data.statements)) {
      for (const row of reply.data.statements) if (row && typeof row.factId === "string" && typeof row.assertion?.subjectId === "string") {
        subjects.set(row.factId, row.assertion.subjectId);
        variants.set(row.factId, projectionVariant(row));
      }
    }
    return reply;
  };
  const corpus = await buildPublishedWikiCorpus(rpc, { city: input.city, scene: definition.scene, locale: input.locale });
  if (corpus.kind === "unavailable") return { kind: "unavailable", reason: corpus.code === "KNOWLEDGE_DISABLED" ? "policy_denied" : "provider_failure" };
  // Current provenance must match the persisted chain; a new publication is
  // not an authorization to replay an old source revision as current fact.
  const refs = [...outcome.evidence.required.flatMap((claim) => claim.refs), ...outcome.evidence.background];
  const citations = outcome.citations.filter((citation) => {
    const prov = corpus.provenance.get(citation.pageKey);
    const entry = corpus.entries.find((row) => row.pageKey === citation.pageKey);
    return prov && entry && entry.text.length < 4000 && entry.text.includes(citation.quote) && refs.some((ref) =>
      ref.statementId === citation.pageKey && ref.publicationId === prov.publicationId
      && JSON.stringify(ref.sourceIds) === JSON.stringify(prov.sourceIds) && ref.span === citation.quote);
  });
  return finalizeAnswer(input, signal, definition, definition.scene, corpus, subjects, variants, rpc, () => subjects, () => variants,
    { ...outcome, citations }, false);
}

/** The RPC projection is data already qualified by the corpus parser. JSONB
 * object key order is irrelevant; ordered arrays and omitted values stay exact. */
function projectionVariant(row: Record<string, unknown>): string {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, field]) => [key, canonical(field)])) : value;
  return JSON.stringify(canonical([row.assertion, { text: row.text, conditions: row.conditions, exclusions: row.exclusions },
    Object.hasOwn(row, "value") ? row.value : null]));
}
