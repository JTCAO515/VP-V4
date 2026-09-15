/**
 * VPJ-76 (#360) probe scope: a deliberately simple lexical scorer over a
 * caller-supplied corpus of *already-published* Wiki text. This is the
 * search side of the agentic loop in wiki-search-job.ts -- the model picks
 * the query, this module only ranks candidates against it. No index, no
 * persistence, no network: given the same corpus and query it is
 * deterministic, so a round of the search loop can be replayed exactly.
 *
 * Deliberately not the #248 hybrid/RRF path (lib/server/knowledge/retrieval/hybrid)
 * or the place-disambiguation lexical baseline (lib/server/knowledge/retrieval/lexical)
 * -- those score fixed fact/entity units, not free-text Wiki passages. This
 * is a separate, smaller primitive; upgrading it to real hybrid retrieval
 * is explicitly out of scope for this slice (see #248's own activation gate).
 */

export type WikiSearchCorpusEntry = Readonly<{ pageKey: string; text: string }>;
export type WikiSearchHit = Readonly<{ pageKey: string; text: string; score: number }>;

const MAX_CORPUS = 500;
const MAX_QUERY_LENGTH = 200;
const MAX_TEXT_LENGTH = 4000;

export function searchWikiCorpus(corpus: readonly WikiSearchCorpusEntry[], query: string, limit = 3): readonly WikiSearchHit[] {
  if (!isValidCorpus(corpus)) throw new TypeError("corpus must be a closed, bounded, deduplicated WikiSearchCorpusEntry array");
  if (typeof query !== "string" || query.trim().length === 0 || query.length > MAX_QUERY_LENGTH) throw new TypeError("query must be a bounded non-empty string");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_CORPUS) throw new TypeError("limit must be a bounded positive integer");
  const terms = tokenize(query);
  if (terms.length === 0) return [];
  return corpus
    .map((entry) => ({ entry, score: scoreEntry(entry.text, terms) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || (a.entry.pageKey < b.entry.pageKey ? -1 : a.entry.pageKey > b.entry.pageKey ? 1 : 0))
    .slice(0, limit)
    .map(({ entry, score }) => ({ pageKey: entry.pageKey, text: entry.text, score }));
}

function scoreEntry(text: string, terms: readonly string[]): number {
  const haystack = tokenize(text);
  if (haystack.length === 0) return 0;
  const haystackSet = new Set(haystack);
  const matched = terms.filter((term) => haystackSet.has(term));
  if (matched.length === 0) return 0;
  // Exact-phrase bonus rewards a query that appears verbatim (normalized), not
  // just a bag-of-words overlap -- keeps a precise multi-word query from
  // scoring equally against a passage that merely shares one common word.
  const phraseBonus = normalize(text).includes(normalize(terms.join(" "))) ? terms.length : 0;
  return matched.length + phraseBonus;
}

function tokenize(value: string): readonly string[] {
  return normalize(value).split(/\s+/).filter((token) => token.length > 1);
}

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function isValidCorpus(value: unknown): value is readonly WikiSearchCorpusEntry[] {
  if (!Array.isArray(value) || value.length > MAX_CORPUS) return false;
  const keys = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const v = entry as Record<string, unknown>;
    if (Object.keys(v).length !== 2) return false;
    if (typeof v.pageKey !== "string" || v.pageKey.length === 0 || v.pageKey.length > 200) return false;
    if (typeof v.text !== "string" || v.text.length === 0 || v.text.length > MAX_TEXT_LENGTH) return false;
    if (keys.has(v.pageKey)) return false;
    keys.add(v.pageKey);
  }
  return true;
}
