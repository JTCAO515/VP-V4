import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("WEB-06 runs its foundation contract through the standard test gate", () => {
  const packageJson = JSON.parse(read("package.json"));
  assert.match(packageJson.scripts.test, /tests\/design\/web-06-foundation\.test\.mjs/);
});

test("WEB-06 derives the shared runtime palette from the approved brand source", () => {
  assert.equal(existsSync("lib/design/tokens.ts"), true, "WEB-06 must expose a runtime token module");
  const source = read("lib/design/tokens.ts");
  assert.match(source, /brand\/tokens\/visepanda\.tokens\.json/);
  assert.match(source, /VP-Plum-900/);
  assert.match(source, /VP-Gold-500/);
  assert.match(source, /touchMinimum/);
});

test("WEB-06 generates the CSS token projection from the approved manifest", () => {
  assert.equal(existsSync("app/design-tokens.generated.css"), true, "build must include a generated CSS token projection");
  if (!existsSync("app/design-tokens.generated.css")) return;
  const manifest = JSON.parse(read("brand/tokens/visepanda.tokens.json"));
  const generated = read("app/design-tokens.generated.css");
  const globalCss = read("app/globals.css");
  const generator = read("scripts/generate-design-tokens.mjs");
  assert.match(globalCss, /@import "\.\/design-tokens\.generated\.css"/);
  assert.match(generator, /brand\/tokens\/visepanda\.tokens\.json/);
  assert.match(generator, /renameSync/, "the generator must atomically replace the CSS projection for dev-server readers");
  for (const [name, token] of Object.entries(manifest.color)) {
    assert.match(generated.toLowerCase(), new RegExp(`--vp-${name.toLowerCase().replace("vp-", "")}: ${token.value.toLowerCase()};`));
  }
  assert.match(generated, new RegExp(`--vp-touch-minimum: ${manifest.layout["touch-minimum"].value};`));
});

test("WEB-06 centralizes all five locale document attributes", () => {
  const source = read("lib/i18n.ts");
  assert.match(source, /getLocaleAttributes/);
  for (const locale of ["zh", "en", "es", "ru", "ar"]) {
    assert.match(source, new RegExp(`\\b${locale}:\\s*\\{[^}]*lang:`));
  }
  assert.match(source, /ar:\s*\{\s*lang:\s*"ar",\s*dir:\s*"rtl"/);
});

test("WEB-06 aligns the Login initial locale with the server document language", () => {
  const layout = read("app/layout.tsx");
  const signIn = read("components/auth/PasswordSignInForm.tsx");
  assert.match(layout, /<html lang="zh-CN"/);
  assert.match(signIn, /useState<Locale>\("zh"\)/);
});

test("WEB-06 supplies shared accessible UI primitives", () => {
  for (const path of [
    "components/brand/VisePandaMark.tsx",
    "components/ui/Button.tsx",
    "components/ui/Field.tsx",
    "components/ui/Badge.tsx",
    "components/ui/DialogDrawer.tsx",
    "components/ui/StateNotice.tsx",
    "components/ui/LocaleSelect.tsx",
    "components/motion/useReducedMotion.ts",
  ]) {
    assert.equal(existsSync(path), true, `missing ${path}`);
  }
  assert.match(read("components/ui/DialogDrawer.tsx"), /<dialog/);
  assert.match(read("components/ui/Field.tsx"), /htmlFor/);
  assert.match(read("components/ui/StateNotice.tsx"), /role="status"/);
});

test("WEB-06 makes tokens, focus targets, and reduced motion globally available", () => {
  const source = read("app/globals.css");
  for (const token of ["--vp-plum-900", "--vp-gold-500", "--vp-touch-minimum", "--vp-focus-outline"]) {
    assert.match(source, new RegExp(token));
  }
  assert.match(source, /:focus-visible/);
  assert.match(source, /min-height:\s*var\(--vp-touch-minimum\)/);
  assert.match(source, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});
