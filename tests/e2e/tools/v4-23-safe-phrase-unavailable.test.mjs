import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../../..", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("V4-23 withholds high-risk Safe Phrase output until reviewed deterministic text and provenance exist", async () => {
  const [page, view] = await Promise.all([
    source("app/visepanda/tools/safe-phrase/page.tsx"),
    source("components/tools/SafePhraseWorkspace.tsx"),
  ]);

  assert.match(page, /SafePhraseWorkspace/);
  assert.match(view, /Safe Phrase is unavailable/);
  assert.match(view, /No reviewed deterministic phrase, provenance, expiry, or offline eligibility exists/);
  assert.match(view, /localeOptions/);
  assert.match(view, /document\.documentElement\.dir = attributes\.dir/);
  for (const label of ["VisePanda 首页", "Inicio de VisePanda", "Главная VisePanda", "الصفحة الرئيسية لـ VisePanda"]) {
    assert.match(view, new RegExp(label));
  }
  assert.doesNotMatch(view, /\bfetch\b|localStorage|sessionStorage|speechSynthesis|<audio\b|<button\b/);
});
