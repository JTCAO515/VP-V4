import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("V4-16 renders durable owner Profile preferences without browser-local writes", () => {
  const page = readFileSync("app/visepanda/profile/page.tsx", "utf8");
  const view = readFileSync("components/user/ProfileWorkspace.tsx", "utf8");
  const route = readFileSync("app/api/profile/route.ts", "utf8");
  assert.match(page, /ProfileWorkspace/);
  assert.match(view, /\/api\/profile/);
  assert.match(view, /currency/);
  assert.match(view, /distanceUnit/);
  assert.match(view, /temperatureUnit/);
  assert.match(view, /defaultDepartureTime/);
  assert.match(view, /localeOptions/);
  assert.match(view, /if \(v\) setLocale\(v\.locale\)/);
  assert.match(view, /dir = attributes\.dir/);
  for (const label of ["VisePanda 首页", "Inicio de VisePanda", "Главная VisePanda", "الصفحة الرئيسية"]) assert.match(view, new RegExp(label));
  assert.doesNotMatch(view, /localStorage|sessionStorage/);
  assert.match(route, /isSameOriginMutation/);
  assert.match(route, /Cache-Control.*private, no-store/);
  assert.doesNotMatch(route, /service_role|SUPABASE_SERVICE/);
});
