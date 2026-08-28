import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(path, "utf8");

test("the root immersive homepage preserves local assets and exact internal routes", () => {
  const root = source("app/page.tsx");
  const relocated = source("app/homepage/page.tsx");
  const hero = source("components/homepage/ImmersiveHomepage.tsx");
  const legacyHomepage = source("components/homepage/Homepage.tsx");
  assert.match(root, /ImmersiveHomepage/);
  assert.match(relocated, /<Homepage\s*\/>/);
  assert.match(hero, /href="\/visepanda"/);
  assert.match(hero, /href="\/homepage"/);
  assert.match(hero, /styles\.landscape/);
  assert.doesNotMatch(hero, /hero-beijing\.jpg/);
  assert.doesNotMatch(hero, /https?:\/\//);
  assert.doesNotMatch(hero, /Map/);
  assert.match(hero, /aria-label=\{content\.home\}/);
  assert.match(hero, /\{content\.kicker\}/);
  assert.match(source("lib/i18n.ts"), /home: string; kicker: string;/);
  assert.match(legacyHomepage, /aria-label=\{content\.header\.home\}/);
  assert.doesNotMatch(legacyHomepage, /aria-label="VisePanda home"/);
});
