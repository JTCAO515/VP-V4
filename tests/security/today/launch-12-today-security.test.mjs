import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("LAUNCH-12 preserves session guards and does not add an unscoped Today data route", () => {
  const page = readFileSync("app/visepanda/today/page.tsx", "utf8");
  const view = readFileSync("components/today/TodayWorkspace.tsx", "utf8");
  assert.match(page, /requireClosedBetaSession\(`\/visepanda\/today`\)/);
  assert.match(view, /list\.status === 401/);
  assert.match(view, /detail\.status === 401/);
  assert.doesNotMatch(view, /NEXT_PUBLIC_|service_role|Authorization|localStorage|sessionStorage/);
});
