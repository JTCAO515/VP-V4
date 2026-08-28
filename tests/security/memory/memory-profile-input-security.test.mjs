import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("V4-13 rejects timezone-less and calendar-invalid Memory timestamps before retrieval", () => {
  const probe = spawnSync(process.execPath, [
    "--experimental-strip-types",
    "--input-type=module",
    "--eval",
    `import { assertMemoryProfile } from "./lib/server/memory/profile.ts";
     const base = { id: "memory-a", ownerId: "actor-a", sourceReceiptId: "receipt-a", consentStatus: "granted", state: "confirmed", constraintKind: "preference", summary: "bounded summary", updatedAt: "2026-08-28T00:00:00.000Z" };
     for (const updatedAt of ["2026-08-28T00:00:00", "2026-02-30T00:00:00Z"]) {
       try { assertMemoryProfile({ ...base, updatedAt }); process.exitCode = 1; } catch {}
     }`,
  ], { encoding: "utf8" });
  assert.equal(probe.status, 0, probe.stderr);
});
