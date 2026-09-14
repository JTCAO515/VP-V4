import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidWikiPage,
  isValidWikiGenerationJob,
  isValidWikiPageRevision,
  derivePageKey,
} from "../../../lib/server/knowledge/wiki/contract.ts";

const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";
const UUID_C = "33333333-3333-3333-3333-333333333333";
const DIGEST = "a".repeat(64);

test("valid wiki page passes", () => {
  assert.equal(isValidWikiPage({ id: UUID_A, pageType: "source_summary", pageKey: "source:x", version: 1 }), true);
});

test("wiki page rejects an unknown page type (closed set)", () => {
  assert.equal(isValidWikiPage({ id: UUID_A, pageType: "faq", pageKey: "x", version: 0 }), false);
});

test("queued job must have no startedAt; a terminal job must have finishedAt", () => {
  assert.equal(isValidWikiGenerationJob({
    id: UUID_A, pageKey: "x", inputDigest: DIGEST, status: "queued",
    startedAt: null, finishedAt: null, cost: { unknown: true }, errorCode: null,
  }), true);
  assert.equal(isValidWikiGenerationJob({
    id: UUID_A, pageKey: "x", inputDigest: DIGEST, status: "queued",
    startedAt: "2026-09-14T00:00:00Z", finishedAt: null, cost: { unknown: true }, errorCode: null,
  }), false, "queued cannot already be started");
  assert.equal(isValidWikiGenerationJob({
    id: UUID_A, pageKey: "x", inputDigest: DIGEST, status: "succeeded",
    startedAt: "2026-09-14T00:00:00Z", finishedAt: null, cost: { unknown: true }, errorCode: null,
  }), false, "a terminal status needs finishedAt");
});

test("only failed jobs carry an errorCode", () => {
  assert.equal(isValidWikiGenerationJob({
    id: UUID_A, pageKey: "x", inputDigest: DIGEST, status: "failed",
    startedAt: "2026-09-14T00:00:00Z", finishedAt: "2026-09-14T00:01:00Z", cost: { unknown: true }, errorCode: "PROVIDER_TIMEOUT",
  }), true);
  assert.equal(isValidWikiGenerationJob({
    id: UUID_A, pageKey: "x", inputDigest: DIGEST, status: "succeeded",
    startedAt: "2026-09-14T00:00:00Z", finishedAt: "2026-09-14T00:01:00Z", cost: { unknown: true }, errorCode: "SHOULD_NOT_BE_HERE",
  }), false);
});

test("a known cost must carry a non-negative token count", () => {
  assert.equal(isValidWikiGenerationJob({
    id: UUID_A, pageKey: "x", inputDigest: DIGEST, status: "succeeded",
    startedAt: "2026-09-14T00:00:00Z", finishedAt: "2026-09-14T00:01:00Z", cost: { unknown: false, tokens: 1200 }, errorCode: null,
  }), true);
  assert.equal(isValidWikiGenerationJob({
    id: UUID_A, pageKey: "x", inputDigest: DIGEST, status: "succeeded",
    startedAt: "2026-09-14T00:00:00Z", finishedAt: "2026-09-14T00:01:00Z", cost: { unknown: false }, errorCode: null,
  }), false, "unknown:false requires tokens");
});

const DRAFT_CONTENT = Object.freeze({ summary: "The museum has daily hours.", gaps: [] });

test("valid revision passes and requires at least one source", () => {
  const revision = {
    id: UUID_A, pageId: UUID_B, version: 1, sourceRevisionIds: [UUID_C], statementRefs: [],
    jobId: UUID_B, promptVersion: "wiki-v1", configDigest: DIGEST, inputDigest: DIGEST,
    generatedAt: "2026-09-14T00:00:00Z", validationStatus: "draft", changeNote: "initial draft",
    draftContent: DRAFT_CONTENT,
  };
  assert.equal(isValidWikiPageRevision(revision), true);
  assert.equal(isValidWikiPageRevision({ ...revision, sourceRevisionIds: [] }), false, "must link at least one source revision");
});

test("revision version must be a positive integer", () => {
  const base = {
    id: UUID_A, pageId: UUID_B, jobId: UUID_B, sourceRevisionIds: [UUID_C], statementRefs: [],
    promptVersion: "wiki-v1", configDigest: DIGEST, inputDigest: DIGEST,
    generatedAt: "2026-09-14T00:00:00Z", validationStatus: "draft", changeNote: "x",
    draftContent: DRAFT_CONTENT,
  };
  assert.equal(isValidWikiPageRevision({ ...base, version: 0 }), false);
  assert.equal(isValidWikiPageRevision({ ...base, version: 1 }), true);
});

test("revision requires a durable draftContent matching {summary, gaps} (VPJ-75 slice 3)", () => {
  const base = {
    id: UUID_A, pageId: UUID_B, version: 1, jobId: UUID_B, sourceRevisionIds: [UUID_C], statementRefs: [],
    promptVersion: "wiki-v1", configDigest: DIGEST, inputDigest: DIGEST,
    generatedAt: "2026-09-14T00:00:00Z", validationStatus: "draft", changeNote: "x",
  };
  assert.equal(isValidWikiPageRevision({ ...base, draftContent: DRAFT_CONTENT }), true);
  assert.equal(isValidWikiPageRevision({ ...base, draftContent: undefined }), false, "draftContent is required, not optional");
  assert.equal(isValidWikiPageRevision({ ...base, draftContent: { summary: "ok" } }), false, "gaps is required");
  assert.equal(
    isValidWikiPageRevision({ ...base, draftContent: { ...DRAFT_CONTENT, extra: "not allowed" } }),
    false,
    "draftContent stays a closed {summary, gaps} object -- the caller's old changeNote text does not substitute for it",
  );
});

test("derivePageKey is deterministic and rejects an unknown page type", () => {
  assert.equal(derivePageKey("source_summary", "source-1"), "source_summary:source-1");
  assert.equal(derivePageKey("source_summary", "source-1"), derivePageKey("source_summary", "source-1"));
  assert.throws(() => derivePageKey("faq", "source-1"));
});
