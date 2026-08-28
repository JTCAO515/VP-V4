import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("V4-14 presents durable Copilot Memory governance without browser-local mutation", () => {
  const page = readFileSync("app/visepanda/copilot/page.tsx", "utf8");
  const view = readFileSync("components/copilot/CopilotMemoryWorkspace.tsx", "utf8");
  const memoryRoute = readFileSync("app/api/memory/route.ts", "utf8");
  const consentRoute = readFileSync("app/api/memory/consent/route.ts", "utf8");
  const transitionRoute = readFileSync("app/api/memory/[memoryId]/route.ts", "utf8");
  assert.match(page, /CopilotMemoryWorkspace/);
  assert.match(view, /\/api\/memory/);
  assert.match(view, /\/api\/memory\/consent/);
  assert.match(view, /Confirm|confirm/);
  assert.match(view, /Reject|reject/);
  assert.match(view, /Pause|pause/);
  assert.match(view, /Forget|forget|Delete|delete/);
  assert.match(view, /sourceReceiptId/);
  assert.match(view, /impacts/);
  assert.match(view, /localeOptions/);
  assert.match(view, /getLocaleAttributes/);
  assert.match(view, /dir = attributes\.dir/);
  for (const label of ["返回 VisePanda", "Volver a VisePanda", "Назад к VisePanda", "العودة إلى VisePanda"]) assert.match(view, new RegExp(label));
  assert.doesNotMatch(view, /localStorage|sessionStorage/);
  for (const route of [memoryRoute, consentRoute, transitionRoute]) {
    assert.match(route, /isSameOriginMutation/);
    assert.match(route, /Cache-Control.*private, no-store/);
    assert.doesNotMatch(route, /service_role|SUPABASE_SERVICE/);
  }
});
