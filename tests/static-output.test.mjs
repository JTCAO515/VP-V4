import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const htmlPath = ".next/server/app/index.html";
const html = readFileSync(htmlPath, "utf8");
const chatbotHtml = readFileSync(".next/server/app/visepanda.html", "utf8");
const clientSource = readFileSync("components/VisePandaLanding.tsx", "utf8");
const localeSource = readFileSync("lib/i18n.ts", "utf8");
const chatbotSource = readFileSync("components/VisePandaChatWorkspace.tsx", "utf8");
const chatbotLocaleSource = readFileSync("lib/chat-workspace-i18n.ts", "utf8");
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

test("renders VisePanda metadata and product-preview copy", () => {
  assert.match(html, /<html lang="zh-CN"/);
  assert.match(html, /<meta name="theme-color" content="#fefdf9"/);
  assert.match(html, /VisePanda｜来华自由行的 AI 规划与执行工作台/);
  assert.match(html, /用 AI 规划中国之旅，再从容地把它走完。/);
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

test("renders the VisePanda AI workspace at the canonical chatbot route", () => {
  assert.match(chatbotHtml, /VisePanda AI \| Chatbot and Trip Canvas preview/);
  assert.match(chatbotHtml, /https:\/\/go2china\.space\/visepanda/);
  assert.match(chatbotHtml, /Trip Canvas/);
  assert.match(chatbotHtml, /Chatbot/);
  assert.match(chatbotHtml, /Product preview/);
  assert.ok(chatbotSource.indexOf('className={`vp-chat-context') < chatbotSource.indexOf('className={`vp-chat-conversation'), "Canvas/POI must render before Chatbot on desktop");
  assert.doesNotMatch(chatbotSource, /Mindtrip|mindtrip/);
});

test("keeps the VisePanda AI workspace localized and frontend-only", () => {
  for (const marker of ["zh:", "en:", "es:", "ru:", "ar:", "🇨🇳", "🇺🇸", "🇪🇸", "🇷🇺", "🇸🇦"]) {
    assert.ok(chatbotLocaleSource.includes(marker) || localeSource.includes(marker), `missing AI workspace locale marker: ${marker}`);
  }
  assert.match(chatbotSource, /document\.documentElement\.dir = locale === "ar" \? "rtl" : "ltr"/);
  assert.match(chatbotLocaleSource, /does not call AI, save input, or change a Trip/);
  assert.match(css, /\.vp-chat-workspace/);
  assert.match(css, /\.vp-chat-mobile-tabs/);
});

test("renders the requested ten-item FAQ, official logo, and VisePanda asset references", () => {
  const faqButtons = html.match(/<button aria-expanded="false">/g) ?? [];
  assert.equal(faqButtons.length, 10, "expected exactly 10 FAQ controls");
  assert.match(html, /VisePanda 可以直接预订机票、酒店或门票吗？/);
  assert.doesNotMatch(html, /六个执行时刻都已经上线了吗？/);
  assert.doesNotMatch(html, /这个页面会保存我的输入吗？/);
  assert.ok((html.match(/\/assets\/visepanda\/brand\/VP-Logo\.svg/g) ?? []).length >= 2, "expected header and footer logo assets");
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

test("uses locale flags and currency symbols without metric state", () => {
  for (const marker of ["🇨🇳", "🇺🇸", "🇪🇸", "🇷🇺", "🇸🇦", 'currencySymbol: "¥"', 'currencySymbol: "$"', 'currencySymbol: "€"', 'currencySymbol: "₽"', 'currencySymbol: "ر.س"']) {
    assert.ok(localeSource.includes(marker), `missing locale navigation marker: ${marker}`);
  }
  assert.match(html, /🇨🇳/);
  assert.match(html, />¥</);
  assert.match(clientSource, /option\.flag/);
  assert.doesNotMatch(clientSource, /isMetric|setIsMetric|header\.metric|header\.imperial/);
});

test("shows complete feature copy without detail toggles", () => {
  const featureSource = clientSource.slice(
    clientSource.indexOf("function FeatureSection"),
    clientSource.indexOf("function Reviews"),
  );
  assert.doesNotMatch(featureSource, /features\.(more|less)|setExpanded|<button onClick=\{\(\) => setExpanded/);
  assert.doesNotMatch(css, /-webkit-line-clamp/);
  assert.match(css, /\.feature-card p\{[^}]*overflow:visible/);
});

test("removes the guessing marquee and evidence-delivery sections", () => {
  assert.doesNotMatch(html, /少点猜测，多一步可执行。/);
  assert.doesNotMatch(html, /VisePanda，按证据逐步交付。/);
  assert.doesNotMatch(clientSource, /function JoyMarquee|function Team|<JoyMarquee|<Team/);
  assert.doesNotMatch(localeSource, /\n\s+joy:|\n\s+delivery:/);
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
