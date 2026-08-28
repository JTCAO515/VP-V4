import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("V4-12 renders only read-only Reservations & Actions with truthful degradation", () => {
  const view = readFileSync("components/canvas/TripActionsView.tsx", "utf8");
  const canvas = readFileSync("components/canvas/TripCanvas.tsx", "utf8");
  assert.match(view, /\/api\/trips\/\$\{tripId\}\/actions/);
  assert.match(view, /Reservations & Actions/);
  assert.match(view, /No orders, payments, inventory, or provider completion/);
  assert.match(view, /const recorded = await response\.json\(\)[\s\S]*?if \(active\) setActions\(recorded\)/);
  assert.doesNotMatch(view, /method:\s*["'](?:POST|PUT|PATCH|DELETE)/);
  assert.match(canvas, /TripActionsView/);
});
