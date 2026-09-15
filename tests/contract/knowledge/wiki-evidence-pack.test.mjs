import assert from "node:assert/strict";
import test from "node:test";
import { buildEvidencePack } from "../../../lib/server/knowledge/wiki/evidence-pack.ts";
import { QUESTION_ONTOLOGY_VERSION } from "../../../lib/server/knowledge/claim/questions.ts";
import { WIKI_SEARCH_PROMPT_REF } from "../../../lib/server/model-gateway/prompt/wiki-search.ts";

const rail = [
  { subjectId: "rail_eticket_boarding", predicate: "requires_document", objectId: "original_valid_booking_id" },
  { subjectId: "rail_eticket_boarding", predicate: "requires_document", objectId: "valid_ticket_not_itinerary_or_receipt" },
];
const provenance = new Map([
  ["fact-booking", { predicate: "requires_document", objectId: "original_valid_booking_id", publicationId: "assertion-booking", sourceIds: ["src-1"] }],
  ["fact-extra", { predicate: "offers_procedure", objectId: "unrelated_thing", publicationId: "assertion-extra", sourceIds: ["src-2", "src-3"] }],
]);

test("a citation whose statement's {predicate,objectId} matches a required claim covers it, with real provenance attached", () => {
  const citations = [{ pageKey: "fact-booking", quote: "a valid booking ID is required" }];
  const pack = buildEvidencePack(citations, provenance, rail, [], []);
  assert.equal(pack.schemaVersion, "evidence-pack/2");
  assert.equal(pack.required.length, 2);
  assert.deepEqual(pack.required[0], {
    claimId: "original_valid_booking_id", status: "covered",
    refs: [{ statementId: "fact-booking", publicationId: "assertion-booking", sourceIds: ["src-1"], span: "a valid booking ID is required" }],
  });
  assert.deepEqual(pack.required[1], { claimId: "valid_ticket_not_itinerary_or_receipt", status: "unresolved", refs: [] });
  assert.deepEqual(pack.background, []);
});

test("a citation matching no required claim is background evidence, not silently dropped or miscounted as coverage", () => {
  const citations = [
    { pageKey: "fact-booking", quote: "a valid booking ID is required" },
    { pageKey: "fact-extra", quote: "an unrelated but cited fact" },
  ];
  const pack = buildEvidencePack(citations, provenance, rail, [], []);
  assert.equal(pack.required[0].status, "covered");
  assert.deepEqual(pack.background, [{ statementId: "fact-extra", publicationId: "assertion-extra", sourceIds: ["src-2", "src-3"], span: "an unrelated but cited fact" }]);
});

test("a citation whose pageKey has no known provenance (never returned by the real corpus) is silently excluded, not fabricated", () => {
  const citations = [{ pageKey: "fact-unknown", quote: "the model cited something not in the corpus" }];
  const pack = buildEvidencePack(citations, provenance, rail, [], []);
  assert.deepEqual(pack.required.every((claim) => claim.status === "unresolved"), true);
  assert.deepEqual(pack.background, []);
});

test("no required claims (e.g. a place question this module never resolves a subject for) leaves required empty, not fabricated coverage", () => {
  const citations = [{ pageKey: "fact-extra", quote: "an unrelated but cited fact" }];
  const pack = buildEvidencePack(citations, provenance, [], [], []);
  assert.deepEqual(pack.required, []);
  assert.equal(pack.background.length, 1);
});

test("missing and conflicts pass through verbatim from the model's own gaps/conflicts, never invented here", () => {
  const pack = buildEvidencePack([], provenance, rail, ["no fee schedule found"], ["two results disagree on the deposit amount"]);
  assert.deepEqual(pack.missing, ["no fee schedule found"]);
  assert.deepEqual(pack.conflicts, ["two results disagree on the deposit amount"]);
  assert.deepEqual(pack.required.every((claim) => claim.status === "unresolved"), true);
});

test("retrievalVersion/ontologyVersion are the repo's own real version constants, and safeTraceId is a fresh random id carrying no private content", () => {
  const a = buildEvidencePack([], provenance, rail, [], []);
  const b = buildEvidencePack([], provenance, rail, [], []);
  assert.equal(a.retrievalVersion, WIKI_SEARCH_PROMPT_REF.version);
  assert.equal(a.ontologyVersion, QUESTION_ONTOLOGY_VERSION);
  assert.match(a.safeTraceId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.notEqual(a.safeTraceId, b.safeTraceId, "each pack gets its own fresh correlation id, not a reused/deterministic one");
});
