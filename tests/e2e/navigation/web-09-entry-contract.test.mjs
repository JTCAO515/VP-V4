import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const moduleUrl = new URL("../../../lib/navigation/workspace-entry.ts", import.meta.url).href;
const run = (expression) => {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", `import * as entry from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(${expression}));`], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};

test("WEB-09 enforces ADR-0018 WorkspaceEntryContextV1 and safe return paths", () => {
  assert.equal(run('entry.safeReturnTo("/auth/sign-in")'), "/auth/sign-in");
  for (const unsafe of ["https://evil.example", "//evil.example", "/visepanda?email=x", "/visepanda#x", "/unknown"]) assert.equal(run(`entry.safeReturnTo(${JSON.stringify(unsafe)})`), "/visepanda");
  const context = run('entry.createWorkspaceEntryContext({source:"home_hero",locale:"ar",intent:"create",presentation:"authenticated",scenarioId:"first-trip",tripId:"1b47b7c5-4e8c-41fd-8e9a-4d850e01f66e"})');
  assert.deepEqual(context, { version: 1, source: "home_hero", locale: "ar", intent: "create", presentation: "authenticated", scenarioId: "first-trip", tripId: "1b47b7c5-4e8c-41fd-8e9a-4d850e01f66e" });
  for (const piiLikeId of ["owner-validated-id", "person@example.com", "passport-123", "plan my trip"]) assert.equal("tripId" in run(`entry.createWorkspaceEntryContext({tripId:${JSON.stringify(piiLikeId)}})`), false);
  assert.deepEqual(run('entry.createWorkspaceEntryContext({source:"bad",locale:"bad",intent:"bad",presentation:"bad",scenarioId:"bad"})'), { version: 1, source: "global_nav", locale: "zh", presentation: "preview" });
});
