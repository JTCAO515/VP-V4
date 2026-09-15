import assert from "node:assert/strict";
import test from "node:test";
import { searchWikiCorpus } from "../../../lib/server/knowledge/wiki/search-index.ts";

const corpus = Object.freeze([
  { pageKey: "source_summary:metro", text: "Shanghai metro tickets can be bought with a single-ride paper ticket or a rechargeable transit card." },
  { pageKey: "source_summary:museum", text: "The museum requires a valid ID document for entry, except for children under 12." },
  { pageKey: "source_summary:railway", text: "High-speed rail tickets in Shanghai can be bought at station kiosks or via the official app." },
]);

test("returns the entry containing every query term, ranked above a partial match", () => {
  const hits = searchWikiCorpus(corpus, "地铁 metro tickets Shanghai");
  assert.equal(hits.length > 0, true);
  assert.equal(hits[0].pageKey, "source_summary:metro");
});

test("an exact phrase match outranks a same-word-count bag-of-words match", () => {
  // Both "metro" and "railway" entries share the words "tickets"/"Shanghai" with
  // this query, but only the railway entry contains "rail tickets" as a phrase.
  const hits = searchWikiCorpus(corpus, "rail tickets Shanghai", 3);
  assert.equal(hits[0].pageKey, "source_summary:railway");
});

test("no matching terms returns an empty array, not an error", () => {
  assert.deepEqual(searchWikiCorpus(corpus, "volcano eruption forecast"), []);
});

test("limit is respected and results are deterministic across repeated calls", () => {
  const a = searchWikiCorpus(corpus, "tickets", 1);
  const b = searchWikiCorpus(corpus, "tickets", 1);
  assert.equal(a.length, 1);
  assert.deepEqual(a, b);
});

test("rejects a malformed corpus instead of silently ignoring bad entries", () => {
  assert.throws(() => searchWikiCorpus([{ pageKey: "x", text: "" }], "x"), TypeError);
  assert.throws(() => searchWikiCorpus([{ pageKey: "x", text: "a", extra: 1 }], "x"), TypeError);
  assert.throws(() => searchWikiCorpus([{ pageKey: "dup", text: "a" }, { pageKey: "dup", text: "b" }], "a"), TypeError);
});

test("rejects an empty or overlong query", () => {
  assert.throws(() => searchWikiCorpus(corpus, ""), TypeError);
  assert.throws(() => searchWikiCorpus(corpus, "x".repeat(201)), TypeError);
});

test("empty corpus returns no results without throwing", () => {
  assert.deepEqual(searchWikiCorpus([], "metro"), []);
});

// CJK text has no spaces to split on -- these reproduce the real gap a real
// GLM probe hit (VPJ-76, wiki-real-model-probe-20260915): a query and a
// passage that both plainly discuss the same thing, in Chinese, matched
// nothing before adjacent-character bigram tokenization was added.
const zhCorpus = Object.freeze([
  { pageKey: "source_summary:metro", text: "上海地铁车票可以在车站自助售票机购买单程纸质票，也可以充值到可重复使用的上海公共交通卡。外国银行卡在自助售票机上不能使用。" },
  { pageKey: "source_summary:museum", text: "上海博物馆参观需要出示有效身份证件，12岁以下儿童可以豁免。" },
]);

test("a real multi-word Chinese query (as an actual model produced, VPJ-76 probe) matches the relevant Chinese passage", () => {
  const hits = searchWikiCorpus(zhCorpus, "上海地铁 购票 外国信用卡");
  assert.equal(hits.length > 0, true);
  assert.equal(hits[0].pageKey, "source_summary:metro");
});

test("a short Chinese query still ranks the passage that actually discusses it above an unrelated one", () => {
  const hits = searchWikiCorpus(zhCorpus, "身份证件", 2);
  assert.equal(hits[0].pageKey, "source_summary:museum");
});

test("an unrelated Chinese query against a Chinese corpus returns no results, not a spurious whole-sentence match", () => {
  assert.deepEqual(searchWikiCorpus(zhCorpus, "火山爆发预警系统"), []);
});

test("bigram overlap is coarse-grained by design: sharing one common two-character word (e.g. 交通) produces a low-scoring hit, not silence and not a false top rank", () => {
  // Real-world edge case found while writing this test: "重庆轨道交通" and "上海公共交通卡"
  // share the bigram "交通" even though the topics are unrelated -- an accepted
  // limitation of unigram/bigram CJK tokenization, not a bug to suppress here.
  const hits = searchWikiCorpus(zhCorpus, "重庆轨道交通实名预约");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].pageKey, "source_summary:metro");
  assert.equal(hits[0].score, 1);
});
