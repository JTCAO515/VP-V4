import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("V4-08 provides a localized private Ask route without prompt submission or Trip writes", () => {
  const page = readFileSync("app/visepanda/ask/[[...thread]]/page.tsx", "utf8");
  const workspace = readFileSync("components/chat/ChatThreadWorkspace.tsx", "utf8");
  const copy = readFileSync("lib/i18n.ts", "utf8");
  assert.match(page, /ChatThreadWorkspace/);
  assert.match(workspace, /\/api\/chat\/threads/);
  assert.match(workspace, /\/api\/chat\/turns\/\$\{turnId\}\/cancel/);
  assert.match(workspace, /\/api\/chat\/turns\/\$\{turn\.id\}\/events\?afterSequence=/);
  assert.match(workspace, /pendingStarts/);
  assert.match(workspace, /visibilitychange/);
  assert.match(workspace, /chat-state-control-v1/);
  assert.match(workspace, /readThread/);
  assert.match(workspace, /copy\.signIn/);
  assert.doesNotMatch(workspace, /textarea|TripPatch|\/api\/trips/);
  for (const title of ["聊天线程", "Chat threads", "Hilos de chat", "Чаты", "سلاسل المحادثة"]) assert.match(copy, new RegExp(title));
});
