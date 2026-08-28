import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(path, "utf8");

test("AI-27 exposes only localized unavailable Explore routes until an eligible projection exists", () => {
  const index = source("app/explore/page.tsx");
  const city = source("app/explore/[city]/page.tsx");
  const poi = source("app/[city]/[poi]/page.tsx");
  const workspace = source("components/explore/ExploreUnavailableWorkspace.tsx");

  for (const route of [index, city, poi]) assert.match(route, /ExploreUnavailableWorkspace/);
  assert.match(workspace, /getLocaleAttributes/);
  assert.match(workspace, /localeOptions/);
  assert.match(workspace, /kicker: string/);
  assert.match(workspace, /\{content\.kicker\}/);
  assert.doesNotMatch(workspace, /Golden Route · \{content\.route\[route\]\}/);
  assert.match(workspace, /unavailable/);
  assert.match(workspace, /href="\/visepanda"/);
  assert.doesNotMatch(workspace, /fetch\(|\/api\/|\bMap\b|<input|candidate|seed|Add to Trip|Ask VisePanda/);
});
