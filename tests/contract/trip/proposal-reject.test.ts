import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isProposalRejectInput } from "../../../lib/server/identity/request-guards.ts";

const id = "5d2a3a26-3b72-4fa7-b121-2a445e1ac9ab";

test("AI-13c accepts only an exact Proposal UUID", () => {
  assert.equal(isProposalRejectInput({ proposalId: id }), true);
  assert.equal(isProposalRejectInput({ proposalId: "not-a-uuid" }), false);
  assert.equal(isProposalRejectInput({}), false);
});

test("AI-13c reject route is same-origin POST only", () => {
  const route = readFileSync("app/api/trips/[tripId]/proposal/reject/route.ts", "utf8");
  assert.match(route, /export async function POST/);
  assert.match(route, /isSameOriginMutation\(request\)/);
  assert.match(route, /adapter\.rejectPendingProposal\(tripId, input\)/);
  assert.doesNotMatch(route, /export async function GET/);
});
