import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { copy, localeOptions } from "../../../lib/i18n.ts";

const pagePath = "app/(auth)/auth/sign-in/page.tsx";
const formPath = "components/auth/PasswordSignInForm.tsx";
const clientPath = "lib/server/identity/browser-auth-client.ts";

test("AI-51b retires Magic Link and owns one password-login path", () => {
  assert.equal(existsSync("app/api/auth/magic-link/route.ts"), false);
  assert.equal(existsSync("app/(auth)/auth/callback/route.ts"), false);
  assert.equal(existsSync(pagePath), true);
  assert.equal(existsSync(formPath), true);
  assert.equal(existsSync(clientPath), true);
});

test("AI-51b exposes password sign-in/sign-out without signup or recovery", () => {
  if (!existsSync(formPath) || !existsSync(clientPath)) return;
  const form = readFileSync(formPath, "utf8");
  const client = readFileSync(clientPath, "utf8");
  assert.match(form, /signInWithPassword/);
  assert.match(form, /signOut/);
  assert.match(client, /createBrowserClient/);
  assert.doesNotMatch(`${form}\n${client}`, /signUp|resetPasswordForEmail|signInWithOtp/);
});

test("AI-51b keeps complete login copy in all five locales", () => {
  for (const { value } of localeOptions) {
    const auth = copy[value].auth;
    for (const text of Object.values(auth)) assert.ok(text.length > 0, `${value} auth copy`);
  }
});
