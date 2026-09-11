import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("Quality PR preserves every full-scope gate and a bounded documentation path", () => {
  const workflow = read(".github/workflows/quality-pr.yml");
  const steps = workflow.split(/\n(?=      - )/).slice(1);
  const commandSteps = new Map(steps.flatMap(step => {
    const command = step.match(/^\s*(?:- )?run: (.+)$/m)?.[1];
    return command ? [[command, step]] : [];
  }));
  for (const command of ["pnpm lint", "pnpm test:contract", "pnpm docs:check"]) {
    assert.ok(commandSteps.has(command), command);
    assert.ok(!commandSteps.get(command).includes("if:"), `${command} must run in both scopes`);
  }
  for (const command of ["pnpm typecheck", "pnpm build", "pnpm test", "pnpm test:unit",
    "pnpm test:integration", "pnpm test:security", "pnpm test:e2e", "pnpm evals",
    "pnpm check:flags", "pnpm check:assets", "pnpm exec playwright install chromium",
    "pnpm exec playwright test --config playwright.config.mjs --workers=1"]) {
    assert.ok(commandSteps.has(command), command);
    assert.ok(commandSteps.get(command).includes("if: steps.scope.outputs.scope != 'documentation'"),
      `${command} must run for full or unknown scope`);
  }
  assert.ok(commandSteps.has("node scripts/ci-change-scope.mjs"));
  assert.ok(commandSteps.get("node --test tests/unit/governance/*.test.mjs")
    .includes("if: steps.scope.outputs.scope == 'documentation'"));
  assert.equal(steps.filter(step => /^\s*(?:- )?run: pnpm build$/m.test(step)).length, 1);
  assert.ok(!commandSteps.has("pnpm test:e2e:frontend"), "reuse the already verified build");
  const standalone = JSON.parse(read("package.json")).scripts["test:e2e:frontend"];
  assert.ok(standalone.startsWith("pnpm build &&"), "standalone browser tests still build");
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
  const directory = mkdtempSync(join(tmpdir(), "vp-suite-outcome-"));
  try {
    mkdirSync(join(directory, "tests", "integration"), { recursive: true });
    writeFileSync(join(directory, "tests", "integration", "skip.test.mjs"),
      'import test from "node:test"; test("unavailable fixture", t => t.skip("deliberately unavailable"));\n');
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [resolve("scripts/run-ci-suite.mjs"), "integration"], {
      encoding: "utf8", env, cwd: directory,
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /VP_CI_SUITE_RESULT .*"outcome":"incomplete"/);
    assert.match(result.stdout, /"skipped":1/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
