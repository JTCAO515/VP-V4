import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../../..", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("V4-29 withholds Guide conflict results until imported fields, current Trip, eligible facts, and a Proposal contract exist", async () => {
  const [page, view] = await Promise.all([
    source("app/visepanda/import/conflicts/page.tsx"),
    source("components/import/GuideConflictWorkspace.tsx"),
  ]);

  assert.match(page, /GuideConflictWorkspace/);
  assert.match(view, /Guide conflict check is unavailable/);
  assert.match(view, /No imported fields, current Trip, eligible facts, or editable Proposal contract exists/);
  assert.match(view, /localeOptions/);
  assert.match(view, /document\.documentElement\.dir = attributes\.dir/);
  for (const label of ["VisePanda 首页", "Inicio de VisePanda", "Главная VisePanda", "الصفحة الرئيسية لـ VisePanda"]) {
    assert.match(view, new RegExp(label));
  }
  assert.doesNotMatch(view, /\bfetch\b|localStorage|sessionStorage|<form\b|<button\b|createProposal|method:\s*["'](?:POST|PUT|PATCH|DELETE)/);
});
