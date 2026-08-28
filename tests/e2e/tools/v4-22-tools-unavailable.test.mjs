import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../../..", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("V4-22 exposes no fictional Tool health or offline capability without health observations", async () => {
  const [page, view] = await Promise.all([
    source("app/visepanda/tools/page.tsx"),
    source("components/tools/ToolsWorkspace.tsx"),
  ]);

  assert.match(page, /ToolsWorkspace/);
  assert.match(view, /Tool status is unavailable/);
  assert.match(view, /No provider health observation, offline cache, or authorized tool call is available/);
  assert.match(view, /localeOptions/);
  assert.match(view, /document\.documentElement\.dir = attributes\.dir/);
  for (const label of ["VisePanda 首页", "Inicio de VisePanda", "Главная VisePanda", "الصفحة الرئيسية لـ VisePanda"]) {
    assert.match(view, new RegExp(label));
  }
  assert.doesNotMatch(view, /\bfetch\b|localStorage|sessionStorage|method:\s*["'](?:POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(view, /tool\.execute|executeToolIntent|<form\b|<button\b/);
});
