import assert from "node:assert/strict";
import test from "node:test";
import { buildResearchWikiCorpus } from "../../../lib/server/knowledge/wiki/research-corpus.ts";

function listResponse(pageKeys) {
  return { pages: pageKeys.map((pageKey) => ({ pageKey, pageType: "source_summary", version: 1 })) };
}
function detailResponse(pageKey, revisions) {
  return { pageKey, pageType: "source_summary", version: revisions.length, revisions, jobs: [] };
}
function revision(version, draftContent) {
  return { id: "11111111-1111-1111-1111-111111111111", version, draftContent, validationStatus: "draft", changeNote: "x", jobId: "22222222-2222-2222-2222-222222222222", promptVersion: "vp-wiki-generation-v1", configDigest: "a".repeat(64), inputDigest: "b".repeat(64), generatedAt: "2026-09-15T00:00:00Z", sourceRevisionIds: [], statementRefs: [], sources: [] };
}

function rpcWith(handlers) {
  return async (name, params) => {
    assert.equal(name, "ops_wiki_read_v1");
    const key = Object.keys(params.p_input).length === 0 ? "" : params.p_input.pageKey;
    const handler = handlers[key];
    if (!handler) throw new Error(`unexpected call for ${JSON.stringify(key)}`);
    return handler();
  };
}

test("lists pages then fetches each detail, extracting the latest revision's summary", async () => {
  const rpc = rpcWith({
    "": async () => ({ data: listResponse(["source_summary:a", "source_summary:b"]), error: null }),
    "source_summary:a": async () => ({ data: detailResponse("source_summary:a", [revision(2, { summary: "Summary A.", gaps: [] }), revision(1, { summary: "Old A.", gaps: [] })]), error: null }),
    "source_summary:b": async () => ({ data: detailResponse("source_summary:b", [revision(1, { summary: "Summary B.", gaps: [] })]), error: null }),
  });
  const outcome = await buildResearchWikiCorpus(rpc);
  assert.deepEqual(outcome, { kind: "corpus", entries: [{ pageKey: "source_summary:a", text: "Summary A." }, { pageKey: "source_summary:b", text: "Summary B." }] });
});

test("extracts the summary from a structured wiki-draft/2 revision too", async () => {
  const proposalDraft = { schemaVersion: "wiki-draft/2", summary: "Structured summary.", gaps: [], statementProposals: [] };
  const rpc = rpcWith({
    "": async () => ({ data: listResponse(["source_summary:a"]), error: null }),
    "source_summary:a": async () => ({ data: detailResponse("source_summary:a", [revision(1, proposalDraft)]), error: null }),
  });
  const outcome = await buildResearchWikiCorpus(rpc);
  assert.deepEqual(outcome, { kind: "corpus", entries: [{ pageKey: "source_summary:a", text: "Structured summary." }] });
});

test("an empty page list is an empty corpus, not an error", async () => {
  const outcome = await buildResearchWikiCorpus(rpcWith({ "": async () => ({ data: listResponse([]), error: null }) }));
  assert.deepEqual(outcome, { kind: "corpus", entries: [] });
});

test("a page with no revisions yet, or a null draftContent (legacy row), is skipped, not an error", async () => {
  const rpc = rpcWith({
    "": async () => ({ data: listResponse(["source_summary:empty", "source_summary:legacy"]), error: null }),
    "source_summary:empty": async () => ({ data: detailResponse("source_summary:empty", []), error: null }),
    "source_summary:legacy": async () => ({ data: detailResponse("source_summary:legacy", [revision(1, null)]), error: null }),
  });
  const outcome = await buildResearchWikiCorpus(rpc);
  assert.deepEqual(outcome, { kind: "corpus", entries: [] });
});

test("a list-call RPC error surfaces as unavailable", async () => {
  const outcome = await buildResearchWikiCorpus(rpcWith({ "": async () => ({ data: null, error: { message: "OPS_FORBIDDEN" } }) }));
  assert.deepEqual(outcome, { kind: "unavailable", code: "OPS_UNAVAILABLE" });
});

test("a detail-call RPC error surfaces as unavailable with its code", async () => {
  const rpc = rpcWith({
    "": async () => ({ data: listResponse(["source_summary:a"]), error: null }),
    "source_summary:a": async () => ({ data: null, error: { message: "OPS_NOT_FOUND" } }),
  });
  const outcome = await buildResearchWikiCorpus(rpc);
  assert.deepEqual(outcome, { kind: "unavailable", code: "OPS_NOT_FOUND" });
});

test("a thrown RPC call is caught, not propagated", async () => {
  const outcome = await buildResearchWikiCorpus(async () => { throw new Error("network down"); });
  assert.deepEqual(outcome, { kind: "unavailable", code: "OPS_UNAVAILABLE" });
});

test("a malformed draftContent (neither known shape) is treated as a real error, not silently skipped", async () => {
  const rpc = rpcWith({
    "": async () => ({ data: listResponse(["source_summary:a"]), error: null }),
    "source_summary:a": async () => ({ data: detailResponse("source_summary:a", [revision(1, { unexpected: "shape" })]), error: null }),
  });
  const outcome = await buildResearchWikiCorpus(rpc);
  assert.deepEqual(outcome, { kind: "unavailable", code: "OPS_UNAVAILABLE" });
});

test("maxPages caps the number of pages fetched, and rejects an out-of-bounds value", async () => {
  let detailCalls = 0;
  const rpc = async (name, params) => {
    if (Object.keys(params.p_input).length === 0) return { data: listResponse(["a", "b", "c"]), error: null };
    detailCalls += 1;
    return { data: detailResponse(params.p_input.pageKey, [revision(1, { summary: "x", gaps: [] })]), error: null };
  };
  const outcome = await buildResearchWikiCorpus(rpc, 2);
  assert.equal(outcome.kind, "corpus");
  assert.equal(outcome.entries.length, 2);
  assert.equal(detailCalls, 2);
  assert.deepEqual(await buildResearchWikiCorpus(rpc, 0), { kind: "unavailable", code: "INVALID_INPUT" });
});
