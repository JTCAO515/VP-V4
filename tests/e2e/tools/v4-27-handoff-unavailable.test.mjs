import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../../..", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("V4-27 withholds a Human Handoff pack until owner-scoped context and operator capacity exist", async () => {
  const [page, view] = await Promise.all([
    source("app/visepanda/tools/handoff/page.tsx"),
    source("components/tools/HandoffWorkspace.tsx"),
  ]);

  assert.match(page, /HandoffWorkspace/);
  assert.match(view, /Human Handoff is unavailable/);
  assert.match(view, /No owner-scoped Trip context, selected city and problem, attempted steps, or operator capacity exists/);
  assert.match(view, /localeOptions/);
  assert.match(view, /document\.documentElement\.dir = attributes\.dir/);
  for (const label of ["VisePanda 首页", "Inicio de VisePanda", "Главная VisePanda", "الصفحة الرئيسية لـ VisePanda"]) {
    assert.match(view, new RegExp(label));
  }
  assert.doesNotMatch(view, /\bfetch\b|localStorage|sessionStorage|<form\b|<button\b|sendMessage|method:\s*["'](?:POST|PUT|PATCH|DELETE)/);
});
