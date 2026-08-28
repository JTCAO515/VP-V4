import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("public preview exposes no Magic Link or auth callback endpoints", () => {
  assert.equal(existsSync("app/api/auth/magic-link/route.ts"), false);
  assert.equal(existsSync("app/(auth)/auth/callback/route.ts"), false);
});

test("UserDataAdapter still derives the actor only from Supabase claims", () => {
  const source = readFileSync("lib/server/identity/user-data-adapter.ts", "utf8");
  assert.match(source, /client\.auth\.getClaims\(\)/);
  assert.doesNotMatch(source, /SERVICE_ROLE|service_role|SUPABASE_SECRET|SUPABASE_SERVICE|guest.*actor|fixed.*actor/i);
});

test("public landing imports no authentication entrypoint", () => {
  const source = readFileSync("app/page.tsx", "utf8");
  assert.doesNotMatch(source, /auth|supabase|magic/i);
});
