import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../../..", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("V4-28 does not accept a private Guide artifact until owner-scoped storage, purpose, TTL, and extraction isolation exist", async () => {
  const [page, view] = await Promise.all([
    source("app/visepanda/import/page.tsx"),
    source("components/import/GuideImportWorkspace.tsx"),
  ]);

  assert.match(page, /GuideImportWorkspace/);
  assert.match(view, /Guide import is unavailable/);
  assert.match(view, /No owner-scoped artifact storage, purpose, TTL, extraction isolation, or correction contract exists/);
  assert.match(view, /localeOptions/);
  assert.match(view, /document\.documentElement\.dir = attributes\.dir/);
  for (const label of ["VisePanda 首页", "Inicio de VisePanda", "Главная VisePanda", "الصفحة الرئيسية لـ VisePanda"]) {
    assert.match(view, new RegExp(label));
  }
  assert.doesNotMatch(view, /\bfetch\b|localStorage|sessionStorage|<input\b|<form\b|<button\b|FormData|FileReader|method:\s*["'](?:POST|PUT|PATCH|DELETE)/);
});
