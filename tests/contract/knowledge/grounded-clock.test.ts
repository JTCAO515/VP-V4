import assert from "node:assert/strict";
import test from "node:test";
import { assertGroundedClaim, type EvidenceReceipt, type GroundedClaim } from "../../../lib/server/contracts/index.ts";
import { prepareGroundedExecution } from "../../../lib/server/knowledge/claim/grounded-execution.ts";

const at = "2026-09-09T04:00:00.000Z";
const expiry = "2026-09-10T00:00:00.000Z";
const receipts: EvidenceReceipt[] = [
  { kind: "fact", factId: "synthetic-address", version: 1, reviewedAt: at, expiresAt: expiry },
  { kind: "observation", observationId: "synthetic-observation", provider: "fixture", policyId: "fixture-policy", expiresAt: expiry },
];

test("grounded execution consistently uses its explicit clock while default contract checks use wall time", (t) => {
  t.mock.method(Date, "now", () => Date.parse("2099-01-01T00:00:00Z"));
  for (const receipt of receipts) {
    const claim: GroundedClaim = { claimType: "address", subjectId: "synthetic-place", value: { lines: ["Synthetic address"], countryCode: "CN" }, asOf: at, evidence: [receipt] };
    const request = { mode: "grounded_execution" as const, now: at, cardId: "clock-case", claims: [{ claim, qualifiers: [] }] };
    assert.equal(prepareGroundedExecution(request).kind, "execution_card");
    assert.equal(prepareGroundedExecution({ ...request, now: expiry }).kind, "unsupported_execution");
    assert.equal(prepareGroundedExecution({ ...request, now: "2099-01-01T00:00:00Z" }).kind, "unsupported_execution");
    assert.throws(() => assertGroundedClaim(claim), /expired/);
    assert.doesNotThrow(() => assertGroundedClaim(claim, Date.parse(at)));
    for (const invalid of [NaN, Infinity, -Infinity]) assert.throws(() => assertGroundedClaim(claim, invalid), /finite/);
  }
});
