import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { safeReturnTo, signInHref } from "../../../lib/navigation/safe-return-to.ts";

const tripId = "e96bffb3-7b7f-4f60-a3d5-0a8564221480";

test("LAUNCH-04 keeps only exact internal private deep links after sign-in", () => {
  assert.equal(safeReturnTo(`/visepanda/trips/${tripId}`), `/visepanda/trips/${tripId}`);
  assert.equal(safeReturnTo(`/visepanda/ask/${tripId}`), `/visepanda/ask/${tripId}`);
  assert.equal(safeReturnTo("/visepanda/profile"), "/visepanda/profile");
  assert.equal(safeReturnTo("https://attacker.example"), "/visepanda");
  assert.equal(safeReturnTo("//attacker.example"), "/visepanda");
  assert.equal(safeReturnTo("/auth/sign-in?returnTo=/visepanda"), "/visepanda");
  assert.equal(signInHref(`/visepanda/ask/${tripId}`), `/auth/sign-in?returnTo=%2Fvisepanda%2Fask%2F${tripId}`);
});

test("LAUNCH-04 private data pages invoke the server session guard before rendering", () => {
  const ask = readFileSync("app/visepanda/ask/[[...thread]]/page.tsx", "utf8");
  const trip = readFileSync("app/visepanda/trips/[tripId]/page.tsx", "utf8");
  const profile = readFileSync("app/visepanda/profile/page.tsx", "utf8");
  const copilot = readFileSync("app/visepanda/copilot/page.tsx", "utf8");
  for (const source of [ask, trip, profile, copilot]) {
    assert.match(source, /requireClosedBetaSession/);
    assert.match(source, /dynamic = "force-dynamic"/);
  }
});
