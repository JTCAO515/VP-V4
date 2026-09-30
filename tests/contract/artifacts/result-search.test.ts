import test from "node:test";
import assert from "node:assert/strict";
import { parseResultSearchPage } from "../../../lib/server/artifacts/result-search-contract.ts";
const id = "11111111-1111-4111-8111-111111111111";
const row = { artifactId: id, revision: 1, title: "Synthetic comparison", summary: "Fixture only", tripId: null, tripVersion: null };
test("search returns only bounded exact references and inert excerpts", () => {
  assert.ok(parseResultSearchPage({ kind: "result_search", results: [row], nextCursor: null }));
  assert.equal(parseResultSearchPage({ kind: "result_search", results: [row, row], nextCursor: null }), null);
  assert.equal(parseResultSearchPage({ kind: "result_search", results: [row], nextCursor: id }), null);
  assert.equal(parseResultSearchPage({ kind: "result_search", results: [{ ...row, body: "private" }], nextCursor: null }), null);
  assert.equal(parseResultSearchPage({ kind: "result_search", results: [row], nextCursor: null, total: 2 }), null);
  assert.equal(parseResultSearchPage({ kind: "result_search", results: [{ ...row, tripVersion: 1 }], nextCursor: null }), null);
  assert.equal(parseResultSearchPage({ kind: "result_search", results: Array(21).fill(row), nextCursor: null }), null);
});
