import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("LAUNCH-11 sends manual structured edits only as a pending Proposal patch", () => {
  const canvas = readFileSync("components/canvas/TripCanvas.tsx", "utf8");
  assert.match(canvas, /manualPatch/);
  assert.match(canvas, /JSON\.parse\(manualPatch\)/);
  assert.match(canvas, /fetch\(`\/api\/trips\/\$\{tripId\}\/proposal`/);
  assert.match(canvas, /body: JSON\.stringify\(\{ patch \}\)/);
  assert.doesNotMatch(canvas, /\/confirm[^\n]*manualPatch/);
});
