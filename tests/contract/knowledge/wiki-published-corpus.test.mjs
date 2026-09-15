import assert from "node:assert/strict";
import test from "node:test";
import { buildPublishedWikiCorpus } from "../../../lib/server/knowledge/wiki/published-corpus.ts";

const scope = Object.freeze({ city: "shanghai", scene: "attraction", locale: "en" });

function readResponse(statements, status = "available") {
  return { schemaVersion: "knowledge-read/1", evaluatedAt: "2026-09-15T00:00:00Z", scope, purpose: "trip_planning", recipient: "first_party", territory: "CN-mainland", status, statements };
}

const statement = Object.freeze({
  factId: "fact-1", version: 1, assertionId: "a1", assertionRevision: 1,
  assertion: { subjectId: "museum", predicate: "requires_document", objectId: "identity_document" },
  scope: { cities: ["shanghai"], scene: "attraction", audience: "international_independent_traveler" },
  text: "Bring ID for entry.", conditions: ["On entry"], exclusions: ["Unless exempt"],
  reviewedAt: "2026-09-14T00:00:00Z", publishedAt: "2026-09-14T00:00:00Z", expiresAt: "2026-09-16T00:00:00Z",
  sources: [{ sourceRevisionId: "11111111-1111-1111-1111-111111111111", sourceKey: "museum_source", revisionLabel: "r1", publisher: "Museum", uri: "urn:x", locator: "p1" }],
});

test("converts a real knowledge_read_v1 response into a search corpus, folding conditions/exclusions into the text", async () => {
  const rpc = async (name, params) => { assert.equal(name, "knowledge_read_v1"); assert.deepEqual(params, { p_input: scope }); return { data: readResponse([statement]), error: null }; };
  const outcome = await buildPublishedWikiCorpus(rpc, scope);
  assert.deepEqual(outcome, { kind: "corpus", entries: [{ pageKey: "fact-1", text: "Bring ID for entry.. On entry. Unless exempt" }] });
});

test("no_eligible_content is an empty corpus, not an error", async () => {
  const outcome = await buildPublishedWikiCorpus(async () => ({ data: readResponse([], "no_eligible_content"), error: null }), scope);
  assert.deepEqual(outcome, { kind: "corpus", entries: [] });
});

test("an RPC-level error surfaces its code without throwing", async () => {
  const outcome = await buildPublishedWikiCorpus(async () => ({ data: null, error: { message: "KNOWLEDGE_DISABLED" } }), scope);
  assert.deepEqual(outcome, { kind: "unavailable", code: "KNOWLEDGE_DISABLED" });
});

test("a thrown/rejected RPC call is caught, not propagated", async () => {
  const outcome = await buildPublishedWikiCorpus(async () => { throw new Error("network down"); }, scope);
  assert.deepEqual(outcome, { kind: "unavailable", code: "KNOWLEDGE_UNAVAILABLE" });
});

test("an invalid scope is rejected before any RPC call", async () => {
  const rpc = () => { throw new Error("must not call"); };
  assert.deepEqual(await buildPublishedWikiCorpus(rpc, { ...scope, city: "invented_city" }), { kind: "unavailable", code: "INVALID_INPUT" });
  assert.deepEqual(await buildPublishedWikiCorpus(rpc, { ...scope, scene: "invented_scene" }), { kind: "unavailable", code: "INVALID_INPUT" });
  assert.deepEqual(await buildPublishedWikiCorpus(rpc, { ...scope, locale: "fr" }), { kind: "unavailable", code: "INVALID_INPUT" });
});

test("a malformed response (wrong schemaVersion, missing fields, or an invalid statement) is rejected, not silently reshaped", async () => {
  const cases = [
    { ...readResponse([statement]), schemaVersion: "knowledge-read/0" },
    { ...readResponse([statement]), status: "available", statements: undefined },
    readResponse([{ ...statement, text: "" }]),
    readResponse([{ ...statement, factId: "" }]),
    readResponse([{ ...statement, conditions: "not an array" }]),
    readResponse([statement, statement]),
  ];
  for (const data of cases) {
    assert.deepEqual(await buildPublishedWikiCorpus(async () => ({ data, error: null }), scope), { kind: "unavailable", code: "KNOWLEDGE_UNAVAILABLE" });
  }
});

test("status available with zero statements is a valid empty corpus", async () => {
  const outcome = await buildPublishedWikiCorpus(async () => ({ data: readResponse([]), error: null }), scope);
  assert.deepEqual(outcome, { kind: "corpus", entries: [] });
});
