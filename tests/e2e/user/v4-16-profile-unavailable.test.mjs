import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("V4-16 renders an honest five-locale Profile unavailable surface without preference writes", () => {
  const page = readFileSync("app/visepanda/profile/page.tsx", "utf8");
  const view = readFileSync("components/user/ProfileWorkspace.tsx", "utf8");
  assert.match(page, /ProfileWorkspace/);
  assert.match(view, /Profile and preferences are unavailable/);
  assert.match(view, /localeOptions/);
  assert.match(view, /dir = attributes\.dir/);
  for (const label of ["VisePanda 首页", "Inicio de VisePanda", "Главная VisePanda", "الصفحة الرئيسية"]) assert.match(view, new RegExp(label));
  assert.doesNotMatch(view, /fetch\(|localStorage|sessionStorage|method:\s*["'](?:POST|PUT|PATCH|DELETE)/);
});
