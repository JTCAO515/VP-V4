import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("V4-10 reads the canonical Trip version and preserves append-only rollback boundaries", () => {
  const page = readFileSync("app/visepanda/trips/[tripId]/page.tsx", "utf8");
  const canvas = readFileSync("components/canvas/TripCanvas.tsx", "utf8");
  const copy = readFileSync("lib/i18n.ts", "utf8");
  assert.match(page, /TripCanvas/);
  assert.match(canvas, /\/api\/trips\/\$\{tripId\}/);
  assert.match(canvas, /headVersion/);
  assert.match(canvas, /versions/);
  assert.match(canvas, /rollbackNotice/);
  assert.match(copy, /Rollback is not a rewrite/);
  assert.match(canvas, /\/rollback/);
  assert.match(canvas, /\/confirm/);
  assert.match(canvas, /crypto\.randomUUID\(\)/);
  assert.match(canvas, /idempotencyKey: pendingRollback\.idempotencyKey/);
  assert.match(canvas, /refreshed\.trip\.headVersion > pendingRollback\.baseTripVersion/);
  assert.doesNotMatch(canvas, /fetch\([^)]*,\s*\{[^}]*method:\s*["'](?:PATCH|PUT|DELETE)/);
  assert.doesNotMatch(canvas, /\/visepanda\/ask\/\$\{(?:audit|version)\.proposalId\}/);
});
