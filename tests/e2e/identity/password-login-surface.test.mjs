import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("AI-51b exposes an accessible five-locale password session surface", () => {
  const page = readFileSync("app/(auth)/auth/sign-in/page.tsx", "utf8");
  const form = readFileSync("components/auth/PasswordSignInForm.tsx", "utf8");
  assert.match(page, /PasswordSignInForm/);
  assert.match(form, /type="email"/);
  assert.match(form, /type="password"/);
  assert.match(form, /autoComplete="current-password"/);
  assert.match(form, /localeOptions\.map/);
  assert.match(form, /document\.documentElement\.dir/);
  assert.match(form, /aria-live="polite"/);
  assert.match(form, /signInWithPassword/);
  assert.match(form, /clearPassword\(\)/);
  assert.match(form, /getClaims\(\)[\s\S]*\.catch\(\(\) =>[\s\S]*setState\("unavailable"\)/);
  assert.match(form, /signOut\(\{ scope: "local" \}\)/);
  assert.equal(existsSync("app/api/auth/magic-link/route.ts"), false);
  assert.equal(existsSync("app/(auth)/auth/callback/route.ts"), false);
});
