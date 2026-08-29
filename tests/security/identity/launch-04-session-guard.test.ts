import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("LAUNCH-04 guard uses the public SSR client only and redirects unauthenticated sessions", () => {
  const guard = readFileSync("lib/server/identity/closed-beta-session-guard.ts", "utf8");
  assert.match(guard, /createServerClient/);
  assert.match(guard, /getClaims/);
  assert.match(guard, /signInHref/);
  assert.doesNotMatch(guard, /SERVICE_ROLE|service_role|SUPABASE_SERVICE|Authorization|console\./i);
});
