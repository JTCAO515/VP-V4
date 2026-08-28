import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../../..", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("V4-24 withholds Ride Assist until confirmed pickup, destination, and provider handoff contracts exist", async () => {
  const [page, view] = await Promise.all([
    source("app/visepanda/tools/ride/page.tsx"),
    source("components/tools/RideAssistWorkspace.tsx"),
  ]);

  assert.match(page, /RideAssistWorkspace/);
  assert.match(view, /Ride Assist is unavailable/);
  assert.match(view, /No confirmed pickup, Chinese destination, provider handoff, or authorized provider observation is available/);
  assert.match(view, /localeOptions/);
  assert.match(view, /document\.documentElement\.dir = attributes\.dir/);
  for (const label of ["VisePanda 首页", "Inicio de VisePanda", "Главная VisePanda", "الصفحة الرئيسية لـ VisePanda"]) {
    assert.match(view, new RegExp(label));
  }
  assert.doesNotMatch(view, /\bfetch\b|localStorage|sessionStorage|geolocation|method:\s*["'](?:POST|PUT|PATCH|DELETE)|<form\b|<button\b/);
});
