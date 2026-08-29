import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("LAUNCH-12 reads only the canonical owner Trip routes and renders Today with no external or write path", () => {
  const page = readFileSync("app/visepanda/today/page.tsx", "utf8");
  const view = readFileSync("components/today/TodayWorkspace.tsx", "utf8");
  const adapter = readFileSync("lib/server/identity/user-data-adapter.ts", "utf8");
  assert.match(page, /requireClosedBetaSession/);
  assert.match(view, /fetch\("\/api\/trips"/);
  assert.match(view, /\/api\/trips\/\$\{tripId\}/);
  assert.match(view, /selectTripNextAction/);
  assert.match(adapter, /content:.*days/s);
  assert.doesNotMatch(view, /method:\s*["'](?:POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(view, /fetch\(\s*["']https?:\/\//);
});
