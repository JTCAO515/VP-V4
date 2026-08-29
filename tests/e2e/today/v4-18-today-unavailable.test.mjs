import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("LAUNCH-12 keeps Today owner-scoped and distinguishes no current Trip from empty Trip data", () => {
  const page = readFileSync("app/visepanda/today/page.tsx", "utf8");
  const view = readFileSync("components/today/TodayWorkspace.tsx", "utf8");
  const projection = readFileSync("components/today/trip-next-action.ts", "utf8");
  assert.match(page, /TodayWorkspace/);
  assert.match(page, /requireClosedBetaSession/);
  assert.match(view, /currentTripId/);
  assert.match(view, /setState\("no_current_trip"\)/);
  assert.match(view, /noCurrentTrip:/);
  assert.match(projection, /reason: "no_items"/);
  assert.match(projection, /"incomplete_data"/);
  assert.match(view, /localeOptions/);
  assert.match(view, /dir = attributes\.dir/);
  for (const label of ["VisePanda 首页", "Inicio de VisePanda", "Главная VisePanda", "الصفحة الرئيسية"]) assert.match(view, new RegExp(label));
  assert.doesNotMatch(view, /localStorage|sessionStorage|method:\s*["'](?:POST|PUT|PATCH|DELETE)|fetch\(\s*["']https?:\/\//);
});
