import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../../..", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("V4-26 withholds Network preparation until reviewed connectivity guidance and eligibility exist", async () => {
  const [page, view] = await Promise.all([
    source("app/visepanda/tools/network/page.tsx"),
    source("components/tools/NetworkWorkspace.tsx"),
  ]);

  assert.match(page, /NetworkWorkspace/);
  assert.match(view, /Network preparation is unavailable/);
  assert.match(view, /No reviewed connectivity guide, fact, coverage boundary, or proposal capability exists/);
  assert.match(view, /localeOptions/);
  assert.match(view, /document\.documentElement\.dir = attributes\.dir/);
  for (const label of ["VisePanda 首页", "Inicio de VisePanda", "Главная VisePanda", "الصفحة الرئيسية لـ VisePanda"]) {
    assert.match(view, new RegExp(label));
  }
  assert.doesNotMatch(view, /\bfetch\b|localStorage|sessionStorage|<form\b|<button\b|createProposal|method:\s*["'](?:POST|PUT|PATCH|DELETE)/);
});
