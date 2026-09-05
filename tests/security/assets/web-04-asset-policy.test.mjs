import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const legacyPublicPaths = [
  "public/assets/visepanda/shape-clover.svg",
  "public/assets/visepanda/shape-organic.svg",
  "public/assets/visepanda/shape-shield.svg",
  "public/assets/visepanda/shape-soft.svg",
  "public/assets/review-video-lavender-background.png",
];

test("WEB-04 removes legacy public assets and source-derived runtime presentation", () => {
  if (existsSync("public/assets/source")) {
    assert.deepEqual(readdirSync("public/assets/source"), [], "legacy source directory must be empty");
  }
  for (const path of legacyPublicPaths) {
    assert.equal(existsSync(path), false, path);
  }

  const layout = readFileSync("app/layout.tsx", "utf8");
  const styles = readFileSync("app/globals.css", "utf8");
  const landing = readFileSync("components/homepage/ImmersiveHomepage.tsx", "utf8")
    + readFileSync("components/homepage/Homepage.tsx", "utf8");
  assert.equal(existsSync("components/VisePandaLanding.tsx"), false);
  assert.equal(existsSync("docs/archive/2026-09-05/VisePandaLanding.tsx.reference"), true);
  assert.doesNotMatch(layout, /fig|assets\/source/i);
  assert.doesNotMatch(styles, /fig|vp-clover/i);
  assert.doesNotMatch(landing, /vp-clover|BrandClip/);
});

test("WEB-04 asset policy check accepts only ledgered non-runtime assets", () => {
  const result = spawnSync(process.execPath, ["scripts/check-assets.mjs"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Asset policy passed/);
});

test("WEB-04 release policy rejects quarantined preview assets", () => {
  const result = spawnSync(process.execPath, ["scripts/check-assets.mjs", "--release"], {
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /blocked-release assets remain in public output/);
});
