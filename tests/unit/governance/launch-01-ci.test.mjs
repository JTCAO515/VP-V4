import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("LAUNCH-01 PR workflow runs every deterministic repository gate and the browser lane", () => {
  const workflow = read(".github/workflows/quality-pr.yml");

  for (const command of [
    "pnpm lint",
    "pnpm typecheck",
    "pnpm build",
    "pnpm test",
    "pnpm test:unit",
    "pnpm test:contract",
    "pnpm test:integration",
    "pnpm test:security",
    "pnpm test:e2e",
    "pnpm test:e2e:frontend",
    "pnpm evals",
    "pnpm docs:check",
    "pnpm check:flags",
    "pnpm check:assets",
  ]) {
    assert.match(workflow, new RegExp(`- run: ${command.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}`));
  }
});

test("LAUNCH-01 CI suite runner reports skipped tests as an explicit incomplete outcome", () => {
  const runner = read("scripts/run-ci-suite.mjs");

  assert.match(runner, /VP_CI_SUITE_RESULT/);
  assert.match(runner, /skipped/);
  assert.match(runner, /incomplete/);
});

test("LAUNCH-01 keeps internal text-asset ledger hashes stable across Git line endings", () => {
  const checker = read("scripts/check-assets.mjs");

  assert.match(checker, /record\.policy === "internal-brand"/);
  assert.match(checker, /\["\.html", "\.json", "\.svg"\]/);
  assert.match(checker, /replace\(\/\\r\\n\/g, "\\n"\)/);
  assert.match(checker, /file\.replaceAll\("\\\\", "\/"\)/);
});

test("LAUNCH-01 workflows initialize a visible CI-suite outcome table", () => {
  for (const workflowPath of [
    ".github/workflows/quality-pr.yml",
    ".github/workflows/quality-release-candidate.yml",
  ]) {
    const workflow = read(workflowPath);
    assert.match(workflow, /GITHUB_STEP_SUMMARY/);
    assert.match(workflow, /\| Suite \| Outcome \| Skipped \| Test files \|/);
    assert.match(workflow, /- run: 'echo "\| --- \| --- \| ---: \| ---: \|" >> "\$GITHUB_STEP_SUMMARY"'/);
  }
});

test("LAUNCH-01 command ledger accepts the LAUNCH Issue namespace", () => {
  const recorder = read("scripts/record-command.mjs");

  assert.match(recorder, /LAUNCH-\\d\{2\}/);
});

test("LAUNCH-01 labels source-inspection E2E tests separately from browser E2E", () => {
  const readme = read("tests/e2e/README.md");

  assert.match(readme, /static contract/i);
  assert.match(readme, /pnpm test:e2e:frontend/);
  assert.match(readme, /browser/i);
});

test("LAUNCH-01 CI suite runner marks a locally skipped integration suite incomplete", () => {
  const env = { ...process.env, VP_LOCAL_SUPABASE: "" };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["scripts/run-ci-suite.mjs", "integration"], {
    encoding: "utf8",
    env,
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /VP_CI_SUITE_RESULT .*"outcome":"incomplete"/);
  assert.match(result.stdout, /"skipped":[1-9]\d*/);
});
