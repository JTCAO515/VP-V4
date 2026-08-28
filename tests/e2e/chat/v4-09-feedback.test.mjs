import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("V4-09 offers only structured feedback and does not make a Trip or model claim", () => {
  const workspace = readFileSync("components/chat/ChatThreadWorkspace.tsx", "utf8");
  const contract = readFileSync("lib/server/turn/feedback/contract.ts", "utf8");
  assert.match(workspace, /\/api\/chat\/turns\/\$\{turnId\}\/feedback/);
  assert.match(workspace, /another_option/);
  assert.match(workspace, /inaccurate/);
  assert.doesNotMatch(workspace, /textarea|\/api\/trips/);
  assert.match(contract, /needs_input.*answer.*card.*proposal_ready.*unavailable.*conflict/);
});
