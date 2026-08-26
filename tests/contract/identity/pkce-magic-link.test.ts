import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const magicLinkRoute = readFileSync("app/api/auth/magic-link/route.ts", "utf8");
const callbackRoute = readFileSync("app/(auth)/auth/callback/route.ts", "utf8");

test("AI-51a persists the PKCE verifier cookie for the browser callback", () => {
  assert.match(magicLinkRoute, /createServerClient/);
  assert.match(magicLinkRoute, /request\.cookies\.getAll\(\)/);
  assert.match(magicLinkRoute, /response\.cookies\.set/);
  assert.doesNotMatch(magicLinkRoute, /\bcreateClient\(/);
  assert.match(magicLinkRoute, /shouldCreateUser:\s*false/);
});

test("AI-51a callback exchanges one code and rejects open redirects", () => {
  assert.match(callbackRoute, /exchangeCodeForSession\(code\)/);
  assert.match(callbackRoute, /value\.startsWith\("\/"\)/);
  assert.match(callbackRoute, /!value\.startsWith\("\/\/"\)/);
});
