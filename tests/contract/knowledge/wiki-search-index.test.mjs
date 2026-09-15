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
