import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("V4-14 presents an honest Copilot Memory unavailable state without local governance mutation", () => {
  const page = readFileSync("app/visepanda/copilot/page.tsx", "utf8");
  const view = readFileSync("components/copilot/CopilotMemoryWorkspace.tsx", "utf8");
  assert.match(page, /CopilotMemoryWorkspace/);
  assert.match(view, /Memory governance is unavailable/);
  assert.match(view, /No memory item, source, impact, or governance action is shown/);
  assert.match(view, /localeOptions/);
  assert.match(view, /getLocaleAttributes/);
  assert.match(view, /dir = attributes\.dir/);
  for (const label of ["返回 VisePanda", "Volver a VisePanda", "Назад к VisePanda", "العودة إلى VisePanda"]) assert.match(view, new RegExp(label));
  assert.doesNotMatch(view, /fetch\(|localStorage|sessionStorage|method:\s*["'](?:POST|PUT|PATCH|DELETE)/);
});
