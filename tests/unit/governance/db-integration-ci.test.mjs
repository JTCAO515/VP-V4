import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { EXCLUDED, LANES, classify, parseNodeTestSummary, pinnedImages, stepProblems } from "../../../scripts/ci-suites/db-integration.mjs";

const read = (path) => readFileSync(path, "utf8");

test("every gated integration test file is in a DB integration lane or on the reasoned allowlist", () => {
  const { rows, problems } = classify();
  assert.deepEqual(problems, []);
  for (const row of rows.filter((r) => r.gated)) assert.notEqual(row.lane, "test:integration", row.file);
  for (const [file, reason] of Object.entries(EXCLUDED)) assert.ok(reason.length > 40, `${file} needs a concrete reason`);
  assert.ok(Object.keys(EXCLUDED).length <= 3, "the not-in-CI allowlist must stay short");
});

test("a DB integration lane fails on skip, todo, cancel, failure, non-zero exit or a missing summary", () => {
  const clean = parseNodeTestSummary("# tests 3\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n");
  assert.deepEqual(stepProblems(0, clean), []);
  const spec = parseNodeTestSummary("ℹ tests 2\nℹ pass 1\nℹ fail 0\nℹ cancelled 0\nℹ skipped 1\nℹ todo 0\n");
  assert.deepEqual(stepProblems(0, spec), ["skipped=1"]);
  assert.deepEqual(stepProblems(0, parseNodeTestSummary("# tests 1\n# pass 0\n# todo 1\n")), ["todo=1"]);
  assert.deepEqual(stepProblems(0, parseNodeTestSummary("# tests 1\n# cancelled 1\n")), ["cancelled=1"]);
  assert.deepEqual(stepProblems(1, parseNodeTestSummary("# tests 1\n# fail 1\n")), ["exit 1", "fail=1"]);
  assert.deepEqual(stepProblems(0, parseNodeTestSummary("no summary")), ["no node:test summary / zero tests"]);
  const twoRuns = parseNodeTestSummary("# tests 2\n# pass 2\n# skipped 0\nℹ tests 3\nℹ pass 2\nℹ skipped 1\n");
  assert.equal(twoRuns.tests, 5);
  assert.equal(twoRuns.skipped, 1);
});

test("DB Integration workflow runs every lane read-only behind one stable aggregate check", () => {
  const workflow = read(".github/workflows/db-integration.yml");
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  const matrix = /lane: \[([^\]]+)\]/.exec(workflow)?.[1].split(",").map((lane) => lane.trim());
  assert.deepEqual([...matrix].sort(), Object.keys(LANES).sort());
  assert.match(workflow, /node scripts\/ci-suites\/db-integration\.mjs --lane \$\{\{ matrix\.lane \}\}/);
  assert.match(workflow, /^  db-integration:\n    if: always\(\)\n    needs: lane$/m);
  assert.ok(pinnedImages().includes("public.ecr.aws/supabase/postgres:17.6.1.159"));
});

test("every workflow declares least-privilege token permissions", () => {
  for (const file of readdirSync(".github/workflows").filter((name) => name.endsWith(".yml"))) {
    const workflow = read(`.github/workflows/${file}`);
    assert.match(workflow, /^permissions:\n  contents: read$/m, `${file} must declare top-level read-only permissions`);
    assert.doesNotMatch(workflow, /write-all|: write$/m, `${file} must not request write scopes`);
  }
});

test("the self-hosted iOS runner never executes fork pull request code", () => {
  const workflow = read(".github/workflows/native-ios.yml");
  const selfHosted = workflow.split(/\n(?=  [a-z][\w-]*:\n)/).filter((block) => /runs-on: \[self-hosted/.test(block));
  assert.ok(selfHosted.length >= 1);
  for (const job of selfHosted) {
    assert.match(job, /if: github\.event_name == 'workflow_dispatch' \|\| github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  }
  assert.doesNotMatch(workflow, /pull_request_target/);
  assert.match(workflow, /persist-credentials: false/);
});
