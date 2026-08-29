import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const htmlPath = ".next/server/app/index.html";
const html = readFileSync(htmlPath, "utf8");
const relocatedHomepageHtml = readFileSync(".next/server/app/homepage.html", "utf8");
const chatbotHtml = readFileSync(".next/server/app/visepanda.html", "utf8");
const homepageSource = readFileSync("components/homepage/Homepage.tsx", "utf8");
const homepageCss = readFileSync("components/homepage/Homepage.module.css", "utf8");
const localeSource = readFileSync("lib/i18n.ts", "utf8");
const chatbotSource = readFileSync("components/chat/ChatThreadWorkspace.tsx", "utf8");
const chatbotPageSource = readFileSync("app/visepanda/page.tsx", "utf8");
const chatbotLocaleSource = readFileSync("lib/chat-workspace-i18n.ts", "utf8");
const productShellCss = readFileSync("components/product-shell/ProductShell.module.css", "utf8");
const generatedTokens = readFileSync("app/design-tokens.generated.css", "utf8");
const documentation = [
  "README.md",
  "CONTEXT.md",
  "HANDOFF.md",
  "design-qa.md",
  "AGENTS.md",
  "docs/handoff.json",
  "docs/adr/0001-nextjs-typescript-tailwind-migration.md",
  "docs/adr/0002-visepanda-brand-localization-assets.md",
].map((file) => readFileSync(file, "utf8")).join("\n");
const cssName = readdirSync(".next/static/css").find((file) => file.endsWith(".css"));
assert.ok(cssName, "compiled CSS must exist");
const css = readFileSync(`.next/static/css/${cssName}`, "utf8");

test("renders immersive VisePanda metadata while preserving the relocated preview", () => {
  assert.match(html, /<html lang="zh-CN"/);
  assert.match(html, /<meta name="theme-color" content="#fefdf9"/);
  assert.match(html, /VisePanda｜来华自由行的 AI 规划与执行工作台/);
  assert.match(html, /找到属于你的中国黄金路线。/);
  assert.match(html, /href="\/visepanda"/);
  assert.match(html, /href="\/homepage"/);
  assert.match(relocatedHomepageHtml, /用 AI 规划中国之旅，再从容地把它走完。/);
  assert.match(localeSource, /当前原型未连接 AI，也不会保存你的输入。/);
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

test("keeps project documentation focused on VisePanda", () => {
  assert.match(documentation, /VisePanda — 来华自由行的 AI 规划与执行工作台/);
  assert.match(documentation, /Chatbot/);
  assert.match(documentation, /Trip Canvas/);
  assert.match(documentation, /Today/);
  assert.doesNotMatch(documentation, /Layla|reference[- ]?(?:site|clone|brand)|参考站点|参考克隆|源站/i);
});

test("renders the VisePanda private workspace at the canonical route", () => {
  assert.match(chatbotHtml, /<title>VisePanda<\/title>/);
  assert.match(chatbotHtml, /https:\/\/go2china\.space\/visepanda/);
  assert.match(chatbotSource, /chatThreadCopy\[locale\]/);
  assert.doesNotMatch(chatbotHtml, /product preview/i);
  assert.match(chatbotPageSource, /ChatThreadWorkspace/);
  assert.doesNotMatch(chatbotPageSource, /VisePandaChatWorkspace/);
  assert.doesNotMatch(chatbotSource, /Mindtrip|mindtrip/);
});

test("keeps the canonical workspace five-locale, owner-API-driven, and map-off", () => {
  assert.match(chatbotSource, /getLocaleAttributes/);
  assert.match(chatbotSource, /chatThreadCopy\[locale\]/);
  assert.match(chatbotSource, /fetch\("\/api\/chat\/threads"/);
  for (const marker of ["zh:", "en:", "es:", "ru:", "ar:"]) assert.match(localeSource, new RegExp(marker));
  assert.doesNotMatch(chatbotSource, /showMap|setShowMap|vp-chat-place-view|\/assets\/visepanda\//);
  assert.match(chatbotSource, /<textarea disabled/);
  assert.doesNotMatch(chatbotSource, /setSubmitted|preview input received/i);
});

test("renders one workspace wordmark", () => {
  assert.doesNotMatch(chatbotSource, /<VisePandaMark\s*\/?>\s*<span>VisePanda<\/span>/);
});

test("keeps the redesigned homepage localized and frontend-only", () => {
  for (const marker of ["zh:", "en:", "es:", "ru:", "ar:", "🇨🇳", "🇺🇸", "🇪🇸", "🇷🇺", "🇸🇦"]) {
    assert.ok(chatbotLocaleSource.includes(marker) || localeSource.includes(marker), `missing AI workspace locale marker: ${marker}`);
  }
  assert.match(homepageSource, /document\.documentElement\.dir = attributes\.dir/);
  assert.match(homepageSource, /href="\/visepanda"/);
  assert.doesNotMatch(homepageSource, /\b(fetch|localStorage|sessionStorage)\s*\(/);
  assert.match(homepageCss, /\.hero/);
  assert.match(homepageCss, /\.routeSection/);
});

test("moves the requested FAQ and legacy wordmarks to homepage without blocked media", () => {
  const faqButtons = relocatedHomepageHtml.match(/<button[^>]*aria-expanded="false"[^>]*>/g) ?? [];
  assert.equal(faqButtons.length, 10, "expected exactly 10 FAQ controls");
  assert.match(relocatedHomepageHtml, /VisePanda 可以直接预订机票、酒店或门票吗？/);
  assert.doesNotMatch(relocatedHomepageHtml, /六个执行时刻都已经上线了吗？/);
  assert.doesNotMatch(relocatedHomepageHtml, /这个页面会保存我的输入吗？/);
  assert.ok((relocatedHomepageHtml.match(/VisePanda\./g) ?? []).length >= 2, "expected header and footer wordmarks");
  assert.doesNotMatch(homepageSource, /\/assets\/visepanda\//);
  assert.doesNotMatch(`${html}\n${relocatedHomepageHtml}`, /\/assets\/source\//);
  assert.doesNotMatch(html, /src="https?:\/\//);
});

test("includes English, Spanish, Russian, and Arabic with RTL switching", () => {
  for (const marker of ["en:", "es:", "ru:", "ar:", "Español", "Русский", "العربية"]) {
    assert.ok(localeSource.includes(marker), `missing locale marker: ${marker}`);
  }
  assert.match(homepageSource, /getLocaleAttributes/);
  assert.match(homepageCss, /\[dir="rtl"\]/);
});

test("keeps locale metadata without adding a metric preference", () => {
  for (const marker of ["🇨🇳", "🇺🇸", "🇪🇸", "🇷🇺", "🇸🇦", 'currencySymbol: "¥"', 'currencySymbol: "$"', 'currencySymbol: "€"', 'currencySymbol: "₽"', 'currencySymbol: "ر.س"']) {
    assert.ok(localeSource.includes(marker), `missing locale navigation marker: ${marker}`);
  }
  assert.doesNotMatch(homepageSource, /isMetric|setIsMetric|header\.metric|header\.imperial/);
});

test("shows complete feature copy as the Golden Route", () => {
  assert.match(homepageSource, /Golden Route/);
  assert.match(homepageSource, /content\.features\.items\[0\]\[0\]/);
  assert.doesNotMatch(homepageCss, /-webkit-line-clamp/);
  assert.match(homepageCss, /\.routeStage/);
});

test("removes the guessing marquee and evidence-delivery sections", () => {
  assert.doesNotMatch(html, /少点猜测，多一步可执行。/);
  assert.doesNotMatch(html, /VisePanda，按证据逐步交付。/);
  assert.doesNotMatch(homepageSource, /function JoyMarquee|function Team|<JoyMarquee|<Team/);
  assert.doesNotMatch(localeSource, /\n\s+joy:|\n\s+delivery:/);
});

test("removes the full four-promises chapter", () => {
  assert.doesNotMatch(html, /四件我们不会提前承诺的事/);
  assert.doesNotMatch(html, /investors-section/);
  assert.doesNotMatch(homepageSource, /function Investors/);
});

test("compiles the redesign tokens and responsive styles", () => {
  assert.match(homepageCss, /--plum: var\(--vp-plum-900\)/);
  assert.match(homepageCss, /--gold: var\(--vp-gold-500\)/);
  assert.match(homepageCss, /@media/);
  assert.match(homepageCss, /prefers-reduced-motion/);
  assert.match(css, /Homepage_hero/);
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
