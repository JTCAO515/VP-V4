import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NextRequest } from "next/server.js";
import { hasForwardedOrigin, isProposalRejectInput, isSameOriginMutation } from "../../../lib/server/identity/request-guards.ts";

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

test("AI-13c accepts only a configured forwarded public origin and rejects attacker headers", () => {
  assert.equal(hasForwardedOrigin("http://127.0.0.1:3231", "127.0.0.1:3231", "http", "http://127.0.0.1:3231"), true);
  assert.equal(hasForwardedOrigin("https://preview.example", "preview.example", "https", "https://preview.example"), true);
  assert.equal(hasForwardedOrigin("https://attacker.example", "preview.example", "https", "https://preview.example"), false);
  assert.equal(hasForwardedOrigin("https://attacker.example", "attacker.example", "https", "https://preview.example"), false);
  assert.equal(hasForwardedOrigin("https://attacker.example", "attacker.example,preview.example", "https", "https://preview.example"), false);
  assert.equal(hasForwardedOrigin("javascript://preview.example", "preview.example", "javascript", "https://preview.example"), false);
});

test("AI-13c accepts the browser origin when Next normalizes the local request URL", () => {
  const request = new NextRequest("http://localhost:3231/api/trips/5d2a3a26-3b72-4fa7-b121-2a445e1ac9ab/proposal/reject", {
    method: "POST",
    headers: { origin: "http://127.0.0.1:3231", host: "127.0.0.1:3231" },
  });

  assert.equal(isSameOriginMutation(request), true);
});
