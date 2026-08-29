import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("V4-08 preserves a localized private state workspace after LAUNCH-10 canonicalizes legacy Ask links", () => {
  const page = readFileSync("app/visepanda/ask/[[...thread]]/page.tsx", "utf8");
  const workspace = readFileSync("components/chat/ChatThreadWorkspace.tsx", "utf8");
  const copy = readFileSync("lib/i18n.ts", "utf8");
  assert.match(page, /redirect\(/);
  assert.match(page, /requireClosedBetaSession/);
  assert.match(workspace, /\/api\/chat\/threads/);
  assert.match(workspace, /\/api\/chat\/turns\/\$\{turnId\}\/cancel/);
  assert.match(workspace, /replayTurnSse/);
  assert.match(workspace, /pendingStarts/);
  assert.match(workspace, /visibilitychange/);
  assert.match(workspace, /chat-state-control-v1/);
  assert.match(workspace, /readThread/);
  assert.match(workspace, /copy\.signIn/);
  assert.match(workspace, /\/api\/trips\/\$\{effectivePlaceCandidate\.tripId\}\/places/);
  assert.match(workspace, /<textarea disabled/);
  assert.doesNotMatch(workspace, /TripPatch|\/api\/trips\/\$\{[^}]+\}\/(?:confirm|rollback|proposal)/);
  for (const title of ["聊天线程", "Chat threads", "Hilos de chat", "Чаты", "سلاسل المحادثة"]) assert.match(copy, new RegExp(title));
});
