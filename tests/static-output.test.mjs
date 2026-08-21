import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const htmlPath = ".next/server/app/index.html";
const html = readFileSync(htmlPath, "utf8");
const clientSource = readFileSync("components/VisePandaLanding.tsx", "utf8");
const localeSource = readFileSync("lib/i18n.ts", "utf8");
const cssName = readdirSync(".next/static/css").find((file) => file.endsWith(".css"));
assert.ok(cssName, "compiled CSS must exist");
const css = readFileSync(`.next/static/css/${cssName}`, "utf8");

test("renders VisePanda metadata and product-preview copy", () => {
  assert.match(html, /<html lang="zh-CN"/);
  assert.match(html, /<meta name="theme-color" content="#fefdf9"/);
  assert.match(html, /VisePanda｜来华自由行的 AI 规划与执行工作台/);
  assert.match(html, /用 AI 规划中国之旅，再从容地把它走完。/);
  assert.match(localeSource, /当前不会。它是前端产品原型，不调用真实 AI，也不保存 Prompt。/);
});

test("removes reference-brand copy and unsupported positive claims", () => {
  for (const forbidden of [
    "Layla",
    "莱拉",
    "Bellboy",
    "Roam Around",
    "2,090,000",
    "我的投资者",
    "在全球顶尖媒体上亮相",
  ]) {
    assert.equal(html.includes(forbidden), false, `compiled HTML contains ${forbidden}`);
  }
});

test("renders the full FAQ, wordmarks, and VisePanda asset references", () => {
  const faqButtons = html.match(/aria-expanded="false"/g) ?? [];
  assert.ok(faqButtons.length >= 12, "expected all 12 FAQ controls");
  assert.match(html, /VisePanda 可以直接预订机票、酒店或门票吗？/);
  assert.ok((html.match(/VisePanda\./g) ?? []).length >= 2, "expected header and footer wordmarks");
  assert.match(html, /src="\/assets\/visepanda\//);
  assert.doesNotMatch(html, /\/assets\/source\//);
  assert.doesNotMatch(html, /src="https?:\/\//);
});

test("includes English, Spanish, Russian, and Arabic with RTL switching", () => {
  for (const marker of ["en:", "es:", "ru:", "ar:", "Español", "Русский", "العربية"]) {
    assert.ok(localeSource.includes(marker), `missing locale marker: ${marker}`);
  }
  assert.match(clientSource, /document\.documentElement\.dir = isArabic \? "rtl" : "ltr"/);
  assert.match(css, /html\[dir=(?:"rtl"|rtl)\]/);
});

test("removes the full four-promises chapter", () => {
  assert.doesNotMatch(html, /四件我们不会提前承诺的事/);
  assert.doesNotMatch(html, /investors-section/);
  assert.doesNotMatch(clientSource, /function Investors/);
});

test("compiles Tailwind tokens and responsive compatibility styles", () => {
  assert.match(css, /bg-vp-paper/);
  assert.match(css, /text-vp-ink/);
  assert.match(css, /\.mobile-user/);
  assert.match(css, /@media/);
});

test("removes the legacy Vite and Sites runtime", () => {
  for (const file of [
    "index.html",
    "vite.config.mjs",
    "src/App.jsx",
    "src/main.jsx",
    "worker/index.js",
    ".openai/hosting.json",
  ]) {
    assert.equal(existsSync(file), false, `${file} should be removed`);
  }
});
