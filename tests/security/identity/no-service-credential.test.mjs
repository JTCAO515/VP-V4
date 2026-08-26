import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const files = [
  "components/auth/PasswordSignInForm.tsx",
  "lib/server/identity/browser-auth-client.ts",
  "app/api/trips/[tripId]/route.ts",
  "app/api/trips/[tripId]/confirm/route.ts",
  "lib/server/identity/user-data-adapter.ts",
];

test("AI-51 UserDataAdapter routes never embed or reference a service credential", () => {
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /SERVICE_ROLE|service_role|SUPABASE_SECRET|SUPABASE_SERVICE/i, file);
  }
});

test("AI-51b has no signup, recovery, admin auth or credential logging path", () => {
  const source = files.slice(0, 2).map((file) => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(source, /\.auth\.(?:signUp|resetPasswordForEmail|signInWithOtp|admin)\b/i);
  assert.doesNotMatch(source, /console\.|logger\.|localStorage|sessionStorage/i);
  assert.doesNotMatch(source, /useState\([^)]*password|setPassword/i);
});
