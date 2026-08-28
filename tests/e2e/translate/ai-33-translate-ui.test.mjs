import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("AI-33 provides a localized manual-translation fallback without a live voice claim", () => {
  const page = readFileSync("app/(product)/translate/page.tsx", "utf8");
  const workspace = readFileSync("components/translate/TranslateWorkspace.tsx", "utf8");
  const styles = readFileSync("components/translate/TranslateWorkspace.module.css", "utf8");

  assert.match(page, /TranslateWorkspace/);
  assert.match(workspace, /zh:/);
  assert.match(workspace, /en:/);
  assert.match(workspace, /es:/);
  assert.match(workspace, /ru:/);
  assert.match(workspace, /ar:/);
  assert.match(workspace, /getLocaleAttributes/);
  assert.match(workspace, /Voice session is unavailable/);
  assert.match(workspace, /className=\{styles\.hold\} type="button" disabled/);
  assert.match(workspace, /Manual text/);
  assert.match(workspace, /No translated text or audio is available/);
  assert.match(workspace, /navigator\.clipboard/);
  assert.doesNotMatch(workspace, /getUserMedia|WebSocket|fetch\(|AudioContext/);
  assert.match(styles, /@media\(max-width:700px\)/);
  assert.match(styles, /\[dir="rtl"\]/);
});
