import type { WikiSearchCorpusEntry } from "../../lib/server/knowledge/wiki/search-index.ts";

/**
 * VPJ-16 (#206) HF-reuse bullet: "借MIRACL方法诊断检索" -- per this repo's
 * own prior research (docs/research/VISEPANDA-HUGGINGFACE-REUSE-REPORT-2026-09-10.md,
 * "4.4 MIRACL 与 BIPIA 的正确用途"): "MIRACL 可用于 en/zh 检索预筛；两种
 * 语言各自测试并不等于跨语言检索" -- borrow MIRACL's *method* (diagnose
 * retrieval failure categories within one language at a time), never its
 * real dataset (real historical Wikipedia passages, licensed content, not
 * a real China travel fact source) and never test cross-lingual matching
 * (a query in one language against corpus text in the other) -- these
 * cases are strictly monolingual, zh-only or en-only.
 *
 * This diagnoses `searchWikiCorpus` (lib/server/knowledge/wiki/search-index.ts)
 * directly -- the deterministic lexical primitive itself, not the
 * agentic loop around it. No model call, no real database; pure
 * synthetic corpus text, adoption tier "直接采用方法" per the research's
 * own resource table (no new tooling, this repo's existing TS harness).
 *
 * Every `expectedHits` value below was verified empirically against the
 * real `searchWikiCorpus` before being written here -- this file
 * documents real, confirmed behavior (including two failure modes this
 * session's own run surfaced that were not anticipated going in: an
 * accidental stopword false-positive, and score ties from short queries),
 * not speculative predictions of what the primitive "should" do.
 */

export type DiagnosisCategory = "exact_match" | "synonym_paraphrase" | "stopword_false_positive" | "short_query_score_tie" | "cjk_bigram_candidate_pollution";

export type ExpectedHit = Readonly<{ pageKey: string; score: number }>;

export type RetrievalDiagnosisCase = Readonly<{
  id: string;
  locale: "zh" | "en";
  category: DiagnosisCategory;
  corpus: readonly WikiSearchCorpusEntry[];
  query: string;
  expectedHits: readonly ExpectedHit[];
  diagnosis: string;
}>;

export const diagnosisCases: readonly RetrievalDiagnosisCase[] = [
  {
    id: "exact-match-en", locale: "en", category: "exact_match",
    corpus: [{ pageKey: "fact-1", text: "International cards are accepted by most large merchants in Shanghai." }],
    query: "international cards merchants Shanghai",
    expectedHits: [{ pageKey: "fact-1", score: 3 }],
    diagnosis: "Positive control: query shares exact keywords with the corpus text -- retrieval works as intended for the case it was actually designed for.",
  },
  {
    id: "exact-match-zh", locale: "zh", category: "exact_match",
    corpus: [{ pageKey: "fact-1", text: "上海大型商户普遍接受国际信用卡。" }],
    query: "上海 国际信用卡 商户",
    expectedHits: [{ pageKey: "fact-1", score: 6 }],
    diagnosis: "Positive control: CJK bigrams from the query overlap the corpus text's bigrams -- the bigram tokenizer (added for VPJ-76's own real-model probe fix) works as intended here.",
  },
  {
    id: "synonym-paraphrase-zh", locale: "zh", category: "synonym_paraphrase",
    corpus: [{ pageKey: "fact-2", text: "乘车须出示原始有效的订票号码。" }],
    query: "上火车需要什么证明我订过座位",
    expectedHits: [],
    diagnosis: "Known, honestly-reported gap: '订过座位'/'证明' shares no bigram with '订票号码'/'乘车'. Pure lexical matching (no embeddings, no synonym expansion) cannot bridge a paraphrase. Not fixed by this eval -- #248's own real-recall activation gate is the only sanctioned path to a semantic upgrade.",
  },
  {
    id: "stopword-false-positive-en", locale: "en", category: "stopword_false_positive",
    corpus: [{ pageKey: "fact-2", text: "Boarding requires the original valid booking ID." }],
    query: "what reservation confirmation do I need to get on the train",
    expectedHits: [{ pageKey: "fact-2", score: 1 }],
    diagnosis: "A real, previously undocumented finding from this eval: the primitive has no stopword list. The *only* overlapping token between this genuinely unrelated paraphrase query and the corpus text is the function word 'the' -- a completely non-semantic match that still produces a nonzero-score hit, not the zero hits a topically-informed reader would expect. This is a real, actionable gap (a small stopword filter would remove this specific false-positive class), reported honestly rather than smoothed over by choosing a case that happened not to share any stopword.",
  },
  {
    id: "short-query-score-tie-en", locale: "en", category: "short_query_score_tie",
    corpus: [
      { pageKey: "fact-relevant", text: "The venue's official opening hours are posted at the entrance." },
      { pageKey: "fact-distractor", text: "The hours of operation for the currency exchange counter vary by branch." },
    ],
    query: "hours",
    expectedHits: [{ pageKey: "fact-distractor", score: 2 }, { pageKey: "fact-relevant", score: 2 }],
    diagnosis: "A single common word about two unrelated topics (venue opening hours vs. currency-exchange-counter hours) scores identically for both (exact-phrase bonus doubles the single-term match for each) -- the primitive cannot itself disambiguate which fact a short query actually means; sort order falls back to pageKey, an implementation detail, not relevance. The real agentic loop's own model-side judgment over multiple returned candidates is the actual disambiguation step, not this primitive alone.",
  },
  {
    id: "short-query-score-tie-zh", locale: "zh", category: "short_query_score_tie",
    corpus: [
      { pageKey: "fact-relevant", text: "该场馆的开放时间已在入口标识。" },
      { pageKey: "fact-distractor", text: "货币兑换柜台的营业时间因网点而异。" },
    ],
    query: "时间",
    expectedHits: [{ pageKey: "fact-distractor", score: 2 }, { pageKey: "fact-relevant", score: 2 }],
    diagnosis: "Same score-tie phenomenon in Chinese: the bigram '时间' appears in both unrelated statements with an identical exact-phrase bonus.",
  },
  {
    id: "cjk-bigram-candidate-pollution", locale: "zh", category: "cjk_bigram_candidate_pollution",
    corpus: [
      { pageKey: "fact-chongqing-rail", text: "重庆轨道交通实名预约系统当前维护中。" },
      { pageKey: "fact-shanghai-transit-card", text: "上海公共交通卡可在地铁站充值。" },
    ],
    query: "重庆轨道交通预约",
    expectedHits: [{ pageKey: "fact-chongqing-rail", score: 6 }, { pageKey: "fact-shanghai-transit-card", score: 1 }],
    diagnosis: "Named, formal regression case for the coarse-grained matching search-index.ts's own comment already documents: the correct, topically-relevant statement wins by a wide score margin (6 vs 1), but the shared bigram '交通' still admits an entirely unrelated Shanghai transit-card statement into the candidate list at all (nonzero score) -- CJK bigram tokenization (adjacent-character pairs, no real segmenter) cannot itself exclude an off-topic candidate purely on shared substrings; only the model's own judgment over the returned candidates (or a real segmenter, out of this eval's scope) can. This formalizes what VPJ-76's wiki-search-convergence-20260915 slice already noted informally as a one-off comment into a permanent, regression-tested diagnosis.",
  },
];
