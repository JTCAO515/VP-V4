import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../../..", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");
const actionIds = [
  "SHELL-01", "SHELL-02", "SHELL-03", "SHELL-04", "TODAY-01", "TODAY-02", "TODAY-03", "TODAY-04", "TODAY-05", "TODAY-06",
  "CHAT-01", "CHAT-02", "CHAT-03", "CHAT-04", "IMPORT-01", "IMPORT-02", "IMPORT-03", "CANVAS-01", "CANVAS-02", "CANVAS-03", "CANVAS-04", "CANVAS-05", "CANVAS-06",
  "MEMORY-01", "MEMORY-02", "MEMORY-03", "TOOL-01", "TOOL-02", "TOOL-03", "TOOL-04", "TOOL-05", "TOOL-06", "EXPLORE-01", "EXPLORE-02", "EXPLORE-03", "EXPLORE-04", "USER-01", "USER-02", "USER-03", "OFFLINE-01",
];

test("V4-31 records every Demo action, eight dimensions, unrun evidence, and a non-release verdict", async () => {
  const [audit, commands, handoff] = await Promise.all([
    source("docs/acceptance/v4-31-parity-audit.md"),
    source("artifacts/V4-31/commands.jsonl"),
    source("docs/handoff.json"),
  ]);
  const normalizedAudit = audit.replace(/\r\n/g, "\n");
  for (const id of actionIds) assert.match(normalizedAudit, new RegExp(`\\| ${id} \\|`));
  for (const dimension of ["Functional", "Interface", "Data", "Security", "Performance", "UX", "Observable", "Compliance"]) {
    assert.match(normalizedAudit, new RegExp(`## ${dimension}`));
  }
  assert.match(normalizedAudit, /## L1-L7 acceptance/);
  assert.match(normalizedAudit, /## Unrun checks and observation window/);
  assert.match(normalizedAudit, /## Verdict\n\n`blocked`/);
  assert.match(normalizedAudit, /local Supabase is not running/);
  const records = commands.trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(records.map((record) => record.command), ["pnpm check", "pnpm test:contract", "pnpm test:integration", "pnpm test:security", "pnpm test:e2e", "pnpm evals", "pnpm docs:check", "git diff --check"]);
  for (const record of records) {
    assert.equal(record.exitCode, 0);
    assert.equal(record.env, "local");
    assert.ok(Date.parse(record.startedAt) <= Date.parse(record.finishedAt));
  }
  assert.doesNotMatch(handoff, /Merge V4-12/);
  assert.match(handoff, /Continue the next eligible locally executable Issue/);
});
