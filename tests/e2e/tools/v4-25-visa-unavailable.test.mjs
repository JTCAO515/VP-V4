import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../../..", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("V4-25 withholds Visa guidance until scoped reviewed policy facts and an authority exist", async () => {
  const [page, view] = await Promise.all([
    source("app/visepanda/tools/visa/page.tsx"),
    source("components/tools/VisaWorkspace.tsx"),
  ]);

  assert.match(page, /VisaWorkspace/);
  assert.match(view, /Visa guidance is unavailable/);
  assert.match(view, /No reviewed policy fact with passport, stay, region, time, authority, and expiry scope exists/);
  assert.match(view, /localeOptions/);
  assert.match(view, /document\.documentElement\.dir = attributes\.dir/);
  for (const label of ["VisePanda 首页", "Inicio de VisePanda", "Главная VisePanda", "الصفحة الرئيسية لـ VisePanda"]) {
    assert.match(view, new RegExp(label));
  }
  assert.doesNotMatch(view, /\bfetch\b|localStorage|sessionStorage|<input\b|<form\b|<button\b|method:\s*["'](?:POST|PUT|PATCH|DELETE)/);
});
