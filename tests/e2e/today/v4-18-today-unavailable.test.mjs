import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("V4-18 browser shows no fictional NextAction or realtime Trip check without owner data", () => {
  const page = readFileSync("app/visepanda/today/page.tsx", "utf8");
  const view = readFileSync("components/today/TodayWorkspace.tsx", "utf8");
  assert.match(page, /TodayWorkspace/);
  assert.match(view, /Today is unavailable/);
  assert.match(view, /No next action, Trip check, realtime state, or recovery result is shown/);
  assert.match(view, /localeOptions/);
  assert.match(view, /dir = attributes\.dir/);
  for (const label of ["VisePanda 首页", "Inicio de VisePanda", "Главная VisePanda", "الصفحة الرئيسية"]) assert.match(view, new RegExp(label));
  assert.doesNotMatch(view, /fetch\(|localStorage|sessionStorage|method:\s*["'](?:POST|PUT|PATCH|DELETE)/);
});
