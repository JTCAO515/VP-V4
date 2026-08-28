export type LexicalCorpusEntry = Readonly<{
  id: string;
  aliases: readonly string[];
  transliterations?: readonly string[];
}>;

export type LexicalQrel = Readonly<{
  id: string;
  locale: "zh" | "en" | "es" | "ru" | "ar";
  mode: "exact_entity" | "city_discovery" | "comparison" | "scene_national" | "ambiguous";
  query: string;
  relevantIds: readonly string[];
}>;

export type LexicalMetric = Readonly<{ queries: number; mrr: number; ndcg: number; noAnswerPrecision: number }>;
const LOCALES = ["zh", "en", "es", "ru", "ar"] as const;
const MODES = ["exact_entity", "city_discovery", "comparison", "scene_national", "ambiguous"] as const;
export type LexicalReport = Readonly<{
  byLocale: Readonly<Record<LexicalQrel["locale"], LexicalMetric>>;
  byMode: Readonly<Partial<Record<LexicalQrel["mode"], LexicalMetric>>>;
  noAnswer: Readonly<{ queries: number; correct: number; precision: number }>;
}>;

export function evaluateLexicalBaseline(corpus: readonly LexicalCorpusEntry[], qrels: readonly LexicalQrel[]): LexicalReport {
  if (!isCorpus(corpus) || !isQrels(qrels, new Set(corpus.map((entry) => entry.id)))) throw new TypeError("Lexical corpus and qrels must be closed fixture records.");
  const scored = qrels.map((qrel) => ({ qrel, rankedIds: rank(corpus, qrel.query) }));
  return Object.freeze({
    byLocale: Object.freeze(Object.fromEntries(LOCALES.map((locale) => [locale, metric(scored.filter(({ qrel }) => qrel.locale === locale))])) as LexicalReport["byLocale"]),
    byMode: Object.freeze(Object.fromEntries(MODES.map((mode) => [mode, metric(scored.filter(({ qrel }) => qrel.mode === mode))]))),
    noAnswer: Object.freeze(noAnswer(scored)),
  });
}

function rank(corpus: readonly LexicalCorpusEntry[], query: string): string[] {
  const normalizedQuery = normalize(query);
  return corpus.map((entry) => ({ entry, score: Math.max(...[...entry.aliases, ...(entry.transliterations ?? [])].map((alias) => score(normalizedQuery, normalize(alias)) )) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || (a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0))
    .map(({ entry }) => entry.id);
}

function score(query: string, alias: string): number {
  if (query === alias) return 3;
  if (distance(query, alias) <= 1) return 2;
  return 0;
}

function metric(items: readonly { qrel: LexicalQrel; rankedIds: readonly string[] }[]): LexicalMetric {
  const total = items.length;
  if (total === 0) return Object.freeze({ queries: 0, mrr: 0, ndcg: 0, noAnswerPrecision: 0 });
  const mrr = items.reduce((sum, item) => sum + reciprocalRank(item), 0) / total;
  const ndcg = items.reduce((sum, item) => sum + dcg(item), 0) / total;
  const noAnswerItems = items.filter(({ qrel }) => qrel.relevantIds.length === 0);
  const noAnswerPrecision = noAnswerItems.length === 0 ? 1 : noAnswerItems.filter((item) => item.rankedIds.length === 0).length / noAnswerItems.length;
  return Object.freeze({ queries: total, mrr, ndcg, noAnswerPrecision });
}

function reciprocalRank({ qrel, rankedIds }: { qrel: LexicalQrel; rankedIds: readonly string[] }): number {
  if (qrel.relevantIds.length === 0) return rankedIds.length === 0 ? 1 : 0;
  const rank = rankedIds.findIndex((id) => qrel.relevantIds.includes(id));
  return rank < 0 ? 0 : 1 / (rank + 1);
}

function dcg({ qrel, rankedIds }: { qrel: LexicalQrel; rankedIds: readonly string[] }): number {
  if (qrel.relevantIds.length === 0) return rankedIds.length === 0 ? 1 : 0;
  const gain = rankedIds.reduce((sum, id, index) => sum + (qrel.relevantIds.includes(id) ? 1 / Math.log2(index + 2) : 0), 0);
  const ideal = Array.from({ length: qrel.relevantIds.length }, (_, index) => 1 / Math.log2(index + 2)).reduce((sum, value) => sum + value, 0);
  return ideal === 0 ? 0 : gain / ideal;
}
function noAnswer(items: readonly { qrel: LexicalQrel; rankedIds: readonly string[] }[]) { const selected = items.filter(({ qrel }) => qrel.relevantIds.length === 0); const correct = selected.filter(({ rankedIds }) => rankedIds.length === 0).length; return { queries: selected.length, correct, precision: selected.length === 0 ? 1 : correct / selected.length }; }
function normalize(value: string): string { return value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ""); }
function distance(left: string, right: string): number { const row = Array.from({ length: right.length + 1 }, (_, index) => index); for (let i = 1; i <= left.length; i += 1) { let previous = row[0]; row[0] = i; for (let j = 1; j <= right.length; j += 1) { const current = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1)); previous = current; } } return row[right.length]; }
function isCorpus(value: unknown): value is readonly LexicalCorpusEntry[] { return Array.isArray(value) && value.length > 0 && new Set(value.map((entry) => entry?.id)).size === value.length && value.every((entry) => typeof entry?.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(entry.id) && Array.isArray(entry.aliases) && entry.aliases.length > 0 && entry.aliases.every(isText) && (entry.transliterations === undefined || Array.isArray(entry.transliterations) && entry.transliterations.every(isText))); }
function isQrels(value: unknown, corpusIds: ReadonlySet<string>): value is readonly LexicalQrel[] { return Array.isArray(value) && new Set(value.map((item) => item?.id)).size === value.length && value.every((item) => typeof item?.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(item.id) && LOCALES.includes(item.locale) && MODES.includes(item.mode) && isText(item.query) && Array.isArray(item.relevantIds) && new Set(item.relevantIds).size === item.relevantIds.length && item.relevantIds.every((id: unknown) => typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id) && corpusIds.has(id))); }
function isText(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= 160; }
