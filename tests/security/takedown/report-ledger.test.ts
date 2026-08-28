import assert from "node:assert/strict";
import test from "node:test";

import { createReportLedger } from "../../../lib/server/knowledge/report/index.ts";

const now = "2026-08-29T00:00:00.000Z";

test("keeps a submitted report private and cannot change a Fact directly", () => {
  const ledger = createReportLedger(() => false);
  const submitted = ledger.submit({ reportId: "report-1", authorId: "user-1", targetId: "fact-1", kind: "rights", now });
  assert.deepEqual(submitted, { kind: "submitted", report: { id: "report-1", authorId: "user-1", targetId: "fact-1", kind: "rights", status: "pending", visibility: "private" } });
  assert.deepEqual(ledger.publicFacts(), []);
  assert.throws(() => ledger.submit({ reportId: "report-2", authorId: "user-1", targetId: "fact-1", kind: "rights", now, text: "raw claim" }), TypeError);
});

test("requires independent verified review before a tombstone cascade and leaves Trips for recheck", () => {
  const ledger = createReportLedger((reviewerId) => reviewerId === "ops-1");
  ledger.submit({ reportId: "report-1", authorId: "user-1", targetId: "fact-1", kind: "rights", now });
  assert.throws(() => ledger.resolve({ reportId: "report-1", reviewerId: "user-1", disposition: "tombstone", now }), TypeError);
  const resolved = ledger.resolve({ reportId: "report-1", reviewerId: "ops-1", disposition: "tombstone", now });
  assert.deepEqual(resolved, { kind: "resolved", audit: { reportId: "report-1", reviewerId: "ops-1", disposition: "tombstone" }, cascade: { cache: "invalidate", media: "recheck", retrieval: "invalidate", explore: "invalidate", seo: "invalidate", trip: "recheck_required" } });
});

test("rejects calendar-impossible audit timestamps before any private Report exists", () => {
  const ledger = createReportLedger(() => false);
  assert.throws(() => ledger.submit({ reportId: "report-1", authorId: "user-1", targetId: "fact-1", kind: "rights", now: "2026-02-31T00:00:00.000Z" }), TypeError);
  assert.deepEqual(ledger.publicFacts(), []);
});

test("rejects unverified reviewers and resolution timestamps before the private submission", () => {
  const ledger = createReportLedger((reviewerId) => reviewerId === "ops-1");
  ledger.submit({ reportId: "report-1", authorId: "user-1", targetId: "fact-1", kind: "rights", now });
  assert.throws(() => ledger.resolve({ reportId: "report-1", reviewerId: "other-1", disposition: "tombstone", now }), TypeError);
  assert.throws(() => ledger.resolve({ reportId: "report-1", reviewerId: "ops-1", disposition: "tombstone", now: "2026-08-28T23:59:59.000Z" }), TypeError);
});

test("requires a strict true verifier result before resolution", () => {
  const ledger = createReportLedger((() => "truthy") as never);
  ledger.submit({ reportId: "report-1", authorId: "user-1", targetId: "fact-1", kind: "rights", now });
  assert.throws(() => ledger.resolve({ reportId: "report-1", reviewerId: "ops-1", disposition: "tombstone", now }), TypeError);
});
