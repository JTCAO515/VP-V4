import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const magicLinkRoute = readFileSync("app/api/auth/magic-link/route.ts", "utf8");
const callbackRoute = readFileSync("app/(auth)/auth/callback/route.ts", "utf8");

test("AI-51a carries the same-browser PKCE cookie boundary from request to callback", () => {
  assert.match(magicLinkRoute, /getAll:\s*\(\)\s*=>\s*request\.cookies\.getAll\(\)/);
  assert.match(magicLinkRoute, /response\.cookies\.set/);
  assert.match(magicLinkRoute, /\/auth\/callback\?next=\/visepanda/);
  assert.match(callbackRoute, /getAll:\s*\(\)\s*=>\s*request\.cookies\.getAll\(\)/);
  assert.match(callbackRoute, /exchangeCodeForSession\(code\)/);
  assert.match(callbackRoute, /response\.cookies\.set/);
});
