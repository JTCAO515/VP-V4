import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("AI-13 renders a private pending Proposal diff before any confirmation", () => {
  const canvas = readFileSync("components/canvas/TripCanvas.tsx", "utf8");

  assert.match(canvas, /\/api\/trips\/\$\{tripId\}\/proposal/);
  assert.match(canvas, /titleDiff\.before/);
  assert.match(canvas, /titleDiff\.after/);
  assert.match(canvas, /evidence === "not_recorded"/);
  assert.match(canvas, /assumptions === "not_recorded"/);
  assert.match(canvas, /reloadAll\(\)/);
  assert.match(canvas, /if \(response\.status === 409\) return null;/);
  assert.match(canvas, /if \(!response\.ok\) throw new Error\("proposal read unavailable"\);/);
});

test("AI-13 uses only the protected Proposal mutation routes and reloads their result", () => {
  const canvas = readFileSync("components/canvas/TripCanvas.tsx", "utf8");

  assert.match(canvas, /\/api\/trips\/\$\{tripId\}\/confirm/);
  assert.match(canvas, /\/api\/trips\/\$\{tripId\}\/proposal\/reject/);
  assert.match(canvas, /\/api\/trips\/\$\{tripId\}\/proposal\/revision/);
  assert.match(canvas, /proposalId: pendingProposal\.proposal\.id/);
  assert.match(canvas, /idempotencyKey/);
  assert.doesNotMatch(canvas, /method:\s*["'](?:PATCH|PUT|DELETE)/);
});

test("AI-13 keeps Canvas proposal copy localized and RTL-aware", () => {
  const canvas = readFileSync("components/canvas/TripCanvas.tsx", "utf8");
  const place = readFileSync("components/canvas/TripPlaceView.tsx", "utf8");
  const actions = readFileSync("components/canvas/TripActionsView.tsx", "utf8");
  const copy = readFileSync("lib/i18n.ts", "utf8");

  assert.match(canvas, /tripCanvasCopy\[locale\]/);
  assert.match(canvas, /getLocaleAttributes\(locale\)/);
  assert.match(copy, /export const tripCanvasCopy/);
  assert.match(copy, /zh: \{/);
  assert.match(copy, /en: \{/);
  assert.match(copy, /es: \{/);
  assert.match(copy, /ru: \{/);
  assert.match(copy, /ar: \{/);
  assert.match(canvas, /TripPlaceView tripId=\{tripId\} locale=\{locale\}/);
  assert.match(canvas, /TripActionsView tripId=\{tripId\} locale=\{locale\}/);
  assert.match(place, /tripPlaceCopy\[locale\]/);
  assert.match(actions, /tripActionsCopy\[locale\]/);
});

test("AI-13 keeps the canonical Trip visible when Proposal read degrades and ignores stale route responses", () => {
  const canvas = readFileSync("components/canvas/TripCanvas.tsx", "utf8");

  assert.match(canvas, /const requestGeneration = useRef\(0\);/);
  assert.match(canvas, /if \(generation !== requestGeneration\.current\) return null;/);
  assert.match(canvas, /setPendingProposal\(null\);/);
  assert.match(canvas, /setNotice\(tripProposalNoticeCopy\[locale\]\);/);
  assert.match(canvas, /async function refreshAfterMutation\(response: Response, generation: number\)/);
  assert.match(canvas, /const current = await reloadAll\(generation\)\.catch/);
  assert.match(canvas, /setNotice\(null\);\s+setMutation\(null\);\s+setState\("loading"\);/);
  assert.doesNotMatch(canvas, /reloadAll\(\)\.catch\(\(\) => setState\("unavailable"\)\)/);
});
