import { randomUUID } from "node:crypto";
import { QUESTION_ONTOLOGY_VERSION, type QuestionClaim } from "../claim/questions.ts";
import { WIKI_SEARCH_PROMPT_REF, type WikiSearchCitation } from "../../model-gateway/prompt/wiki-search.ts";
import type { StatementProvenance } from "./published-corpus.ts";

/**
 * VPJ-76 (#360) slice 10: EvidencePack v2, the acceptance criteria's own
 * required schema -- "required/background/missing/conflicts 及
 * statement/publication/source/span 和检索/ontology版本" (docs/program/2026-09-05/issue-bodies/VPJ-76.md).
 * Built here, in code, from citations the model already returned plus the
 * real provenance published-corpus.ts now carries through from
 * knowledge_read_v1 -- never trusted from the model's own self-report.
 * Whether a required claim is "covered" is decided by matching a citation's
 * underlying statement {predicate,objectId} against the claim's own triple
 * (the exact check grounded-turn/1's resolver already uses), the same
 * "completeness is not decided by relevance" principle the acceptance
 * criteria names explicitly.
 *
 * Additive: GroundedSearchOutcome's "answered" variant keeps its existing
 * summary/citations/gaps fields (what Web/iOS already render) and gains
 * this as `evidence` -- a structured supplement for anything that needs
 * real provenance (an evaluation harness, an audit trail), not a
 * replacement of the simpler fields already shipped in slices 7-9.
 */

export type EvidenceRef = Readonly<{
  /** The published fact's id (knowledge_read_v1's `factId`). */
  statementId: string;
  /** The published assertion instance this statement came from (`assertionId`). */
  publicationId: string;
  /** Every source revision backing the published assertion. */
  sourceIds: readonly string[];
  /** The model's own verbatim quote -- the closest thing to a span locator this corpus's plain-text statements support. */
  span: string;
}>;

export type EvidenceClaim = Readonly<{
  claimId: string;
  status: "covered" | "unresolved";
  refs: readonly EvidenceRef[];
}>;

export type EvidencePack = Readonly<{
  schemaVersion: "evidence-pack/2";
  /** One entry per claim `questionDefinition()` requires for this intent; empty when the intent has no fixed claim set this module can resolve (place questions -- see grounded-search.ts). */
  required: readonly EvidenceClaim[];
  /** Citations that did not match any required claim -- extra context, not obligation coverage. */
  background: readonly EvidenceRef[];
  /** The model's own gaps: coverage genuinely missing from the search results. */
  missing: readonly string[];
  /** The model's own conflicts: search results that disagreed with each other. */
  conflicts: readonly string[];
  retrievalVersion: string;
  ontologyVersion: string;
  /** Random correlation id for debugging without persisting or exposing any private source text. */
  safeTraceId: string;
}>;

export function buildEvidencePack(
  citations: readonly WikiSearchCitation[],
  provenance: ReadonlyMap<string, StatementProvenance>,
  claims: readonly QuestionClaim[],
  missing: readonly string[],
  conflicts: readonly string[],
): EvidencePack {
  const refFor = (citation: WikiSearchCitation): EvidenceRef | null => {
    const prov = provenance.get(citation.pageKey);
    return prov ? { statementId: citation.pageKey, publicationId: prov.publicationId, sourceIds: prov.sourceIds, span: citation.quote } : null;
  };
  const usedForRequired = new Set<string>();
  const required: readonly EvidenceClaim[] = claims.map((claim) => {
    const refs: EvidenceRef[] = [];
    for (const citation of citations) {
      const prov = provenance.get(citation.pageKey);
      if (!prov || prov.predicate !== claim.predicate || prov.objectId !== claim.objectId) continue;
      const ref = refFor(citation);
      if (!ref) continue;
      refs.push(ref);
      usedForRequired.add(citation.pageKey);
    }
    return { claimId: claim.objectId, status: refs.length > 0 ? "covered" : "unresolved", refs };
  });
  const background: EvidenceRef[] = [];
  for (const citation of citations) {
    if (usedForRequired.has(citation.pageKey)) continue;
    const ref = refFor(citation);
    if (ref) background.push(ref);
  }
  return {
    schemaVersion: "evidence-pack/2", required, background, missing, conflicts,
    retrievalVersion: WIKI_SEARCH_PROMPT_REF.version, ontologyVersion: QUESTION_ONTOLOGY_VERSION, safeTraceId: randomUUID(),
  };
}
