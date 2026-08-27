import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isProposalRevisionInput } from "../../../lib/server/identity/request-guards.ts";

const id = "5d2a3a26-3b72-4fa7-b121-2a445e1ac9ab";

test("AI-13b accepts only bounded owner revision input", () => {
  assert.equal(isProposalRevisionInput({ proposalId: id, title: "Revised title" }), true);
  assert.equal(isProposalRevisionInput({ proposalId: id, title: " " }), false);
  assert.equal(isProposalRevisionInput({ proposalId: id, title: "x".repeat(161) }), false);
  assert.equal(isProposalRevisionInput({ proposalId: "not-a-uuid", title: "Revised title" }), false);
});

test("AI-13b revision route is same-origin POST only", () => {
  const route = readFileSync("app/api/trips/[tripId]/proposal/revision/route.ts", "utf8");
  assert.match(route, /export async function POST/);
  assert.match(route, /isSameOriginMutation\(request\)/);
  assert.match(route, /adapter\.revisePendingProposal\(tripId, input\)/);
  assert.doesNotMatch(route, /export async function GET/);
});
