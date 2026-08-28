import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("AI-13c reject route has no privileged credential or cross-origin bypass", () => {
  const files = ["app/api/trips/[tripId]/proposal/reject/route.ts", "lib/server/identity/user-data-adapter.ts"];
  const source = files.map((file) => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(source, /SERVICE_ROLE|service_role|SUPABASE_SECRET|SUPABASE_SERVICE/i);
  assert.match(source, /isSameOriginMutation\(request\)/);
  assert.match(source, /\.eq\("status", "pending"\)/);
});
