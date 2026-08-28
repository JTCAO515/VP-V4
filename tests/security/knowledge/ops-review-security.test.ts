import assert from "node:assert/strict";
import test from "node:test";

import { createOpsReviewLedger } from "../../../lib/server/knowledge/review/ops-review.ts";

const now = "2026-08-28T00:00:00.000Z";

test("RL-08 author cannot review their own private Fact draft", () => {
  const ledger = createOpsReviewLedger();
  ledger.submit({ now, authorId: "author-001", draftId: "draft-001" });
  assert.throws(() => ledger.review({ now, reviewerId: "author-001", draftId: "draft-001", audit: "record" }), TypeError);
  assert.deepEqual(ledger.reviewedFacts(), []);
});

test("RL-08 audit failure rolls publication back without a Fact", () => {
  const ledger = createOpsReviewLedger();
  ledger.submit({ now, authorId: "author-001", draftId: "draft-001" });
  assert.throws(() => ledger.review({ now, reviewerId: "reviewer-002", draftId: "draft-001", audit: "fail" }), TypeError);
  assert.deepEqual(ledger.reviewedFacts(), []);
  assert.deepEqual(ledger.audit(), []);
});

test("RL-08 independent review yields only private metadata and never an Ops secret", () => {
  const ledger = createOpsReviewLedger();
  ledger.submit({ now, authorId: "author-001", draftId: "draft-001" });
  const result = ledger.review({ now, reviewerId: "reviewer-002", draftId: "draft-001", audit: "record" });
  assert.equal(result.fact.visibility, "private");
  assert.equal(result.audit.reviewerId, "reviewer-002");
  assert.equal(Object.hasOwn(result, "secret"), false);
});

test("RL-08 rejects impossible or timezone-less timestamps before a Draft exists", () => {
  const ledger = createOpsReviewLedger();
  assert.throws(() => ledger.submit({ now: "2026-02-30T00:00:00Z", authorId: "author-001", draftId: "draft-001" }), TypeError);
  assert.throws(() => ledger.submit({ now: "2026-08-28T00:00:00", authorId: "author-001", draftId: "draft-001" }), TypeError);
  assert.doesNotThrow(() => ledger.submit({ now, authorId: "author-001", draftId: "draft-001" }));
});
