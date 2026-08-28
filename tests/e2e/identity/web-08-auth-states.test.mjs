import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("WEB-08 exposes bounded closed-beta and first-run presentation states", () => {
  const form = readFileSync("components/auth/PasswordSignInForm.tsx", "utf8");
  const firstRun = "components/first-run/FirstRunState.tsx";
  const localeSource = readFileSync("lib/i18n.ts", "utf8");

  for (const state of ["checking", "ready", "submitting", "invalid", "notProvisioned", "rateLimited", "unavailable", "expired", "signedIn", "signingOut"]) {
    assert.match(form, new RegExp(`"${state}"`), `missing ${state} presentation state`);
  }

  assert.match(form, /autoComplete="username"/);
  assert.match(form, /aria-live="polite"/);
  assert.match(form, /notProvisioned/);
  assert.match(form, /data-auth-state=/);
  assert.match(form, /showFirstRun/);
  assert.match(form, /\{showFirstRun \? <FirstRunState authCopy=\{authCopy\} \/> : null\}/);
  assert.equal(existsSync(firstRun), true, "first-run state must be an explicit component");

  const firstRunSource = readFileSync(firstRun, "utf8");
  assert.match(firstRunSource, /first-run/);
  assert.match(firstRunSource, /firstRunBody/);
  assert.match(localeSource, /does not create or save a trip automatically/i);
  assert.doesNotMatch(firstRunSource, /fetch\(|localStorage|sessionStorage/);
});
