import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const files = [
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
