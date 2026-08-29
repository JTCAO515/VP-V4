import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("LAUNCH-04 sign-in surface returns only to the server-sanitized private route", () => {
  const page = readFileSync("app/(auth)/auth/sign-in/page.tsx", "utf8");
  const form = readFileSync("components/auth/PasswordSignInForm.tsx", "utf8");
  assert.match(page, /safeReturnTo/);
  assert.match(page, /returnTo/);
  assert.match(form, /router\.replace\(returnTo\)/);
  assert.match(form, /href=\{returnTo\}/);
});
