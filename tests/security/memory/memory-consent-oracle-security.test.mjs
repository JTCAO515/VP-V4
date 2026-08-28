import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("V4-14 uses a server-minted consent creation request and a forward oracle repair", () => {
  assert.equal(existsSync("supabase/migrations/20260829191000_v4_14_server_minted_memory_consent.sql"), true);
  const probe = spawnSync(process.execPath, [
    "--experimental-strip-types",
    "--input-type=module",
    "--eval",
    `import { isMemoryConsentInput } from "./lib/server/identity/request-guards.ts";
     const id = "00000000-0000-4000-8000-000000000001";
     if (!isMemoryConsentInput({ action: "create" })) process.exitCode = 1;
     if (isMemoryConsentInput({ action: "create", consentId: id })) process.exitCode = 2;
     if (!isMemoryConsentInput({ action: "grant", consentId: id })) process.exitCode = 3;
     if (!isMemoryConsentInput({ action: "revoke", consentId: id })) process.exitCode = 4;`,
  ], { encoding: "utf8" });
  assert.equal(probe.status, 0, probe.stderr);
});
