import assert from "node:assert/strict";
import test from "node:test";
import { evaluateLexicalBaseline } from "../../lib/server/knowledge/retrieval/lexical/index.ts";

const corpus = [
  { id: "poi-forbidden-city", aliases: ["故宫", "Forbidden City", "Palace Museum", "Гугун", "المدينة المحرمة"], transliterations: ["Gugong"] },
  { id: "poi-temple-heaven", aliases: ["天坛", "Temple of Heaven", "Храм Неба", "معبد السماء"] },
];

const qrels = [
  { id: "zh-exact", locale: "zh", mode: "exact_entity", query: "故宫", relevantIds: ["poi-forbidden-city"] },
  { id: "en-transliteration", locale: "en", mode: "exact_entity", query: "Gugong", relevantIds: ["poi-forbidden-city"] },
  { id: "es-typo", locale: "es", mode: "exact_entity", query: "Forbiden City", relevantIds: ["poi-forbidden-city"] },
  { id: "ru-alias", locale: "ru", mode: "exact_entity", query: "Храм Неба", relevantIds: ["poi-temple-heaven"] },
  { id: "ar-alias", locale: "ar", mode: "exact_entity", query: "المدينة المحرمة", relevantIds: ["poi-forbidden-city"] },
  { id: "zh-no-answer", locale: "zh", mode: "ambiguous", query: "不存在地点", relevantIds: [] },
] as const;

test("reports deterministic MRR, nDCG, and no-answer results by locale and query mode", () => {
  const report = evaluateLexicalBaseline(corpus, qrels);
  assert.equal(report.byLocale.zh.mrr, 1);
  assert.equal(report.byLocale.en.mrr, 1);
  assert.equal(report.byLocale.es.ndcg, 1);
  assert.equal(report.byLocale.ru.mrr, 1);
  assert.equal(report.byLocale.ar.mrr, 1);
  assert.deepEqual(report.byMode.ambiguous, { queries: 1, mrr: 1, ndcg: 1, noAnswerPrecision: 1 });
  assert.equal(report.noAnswer.precision, 1);
});

test("fails closed for malformed qrels and never converts an unmatched query into a result", () => {
  assert.throws(() => evaluateLexicalBaseline(corpus, [{ ...qrels[0], locale: "de" }] as never), TypeError);
  assert.throws(() => evaluateLexicalBaseline([{ id: "poi", aliases: [] }], qrels), TypeError);
  const report = evaluateLexicalBaseline(corpus, [{ id: "en-no-answer", locale: "en", mode: "ambiguous", query: "missing place", relevantIds: [] }]);
  assert.deepEqual(report.byLocale.en, { queries: 1, mrr: 1, ndcg: 1, noAnswerPrecision: 1 });
});

test("rejects duplicate, malformed, and out-of-corpus relevance identifiers", () => {
  const base = { id: "bad-relevance", locale: "en" as const, mode: "exact_entity" as const, query: "Forbidden City" };
  assert.throws(() => evaluateLexicalBaseline(corpus, [{ ...base, relevantIds: ["missing"] }]), TypeError);
  assert.throws(() => evaluateLexicalBaseline(corpus, [{ ...base, relevantIds: ["poi-forbidden-city", "poi-forbidden-city"] }]), TypeError);
  assert.throws(() => evaluateLexicalBaseline(corpus, [{ ...base, relevantIds: [""] }]), TypeError);
});

test("reports every frozen query mode with deterministic zero-sample metrics", () => {
  const report = evaluateLexicalBaseline(corpus, qrels);
  assert.deepEqual(report.byMode.city_discovery, { queries: 0, mrr: 0, ndcg: 0, noAnswerPrecision: 0 });
  assert.deepEqual(report.byMode.comparison, { queries: 0, mrr: 0, ndcg: 0, noAnswerPrecision: 0 });
  assert.deepEqual(report.byMode.scene_national, { queries: 0, mrr: 0, ndcg: 0, noAnswerPrecision: 0 });
});

test("uses discounted cumulative gain rather than reciprocal rank for a lower-ranked relevant alias", () => {
  const report = evaluateLexicalBaseline(
    [{ id: "a-first", aliases: ["shared"] }, { id: "b-relevant", aliases: ["shared"] }],
    [{ id: "second-rank", locale: "en", mode: "exact_entity", query: "shared", relevantIds: ["b-relevant"] }],
  );
  assert.equal(report.byLocale.en.mrr, 0.5);
  assert.equal(report.byLocale.en.ndcg, 1 / Math.log2(3));
});
