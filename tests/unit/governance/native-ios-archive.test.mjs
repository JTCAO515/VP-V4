import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(".github/workflows/native-ios-archive.yml", "utf8");
const jobs = Object.fromEntries(
  workflow.split(/^jobs:\n/m)[1].split(/\n(?=  [a-z][\w-]*:\n)/).map((block) => [/^  ([a-z][\w-]*):/.exec(block)[1], block]),
);

test("archive workflow is manual-only, read-only and limited to this repository", () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:\n/m);
  assert.doesNotMatch(workflow, /pull_request|push:|schedule:|workflow_run/);
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.doesNotMatch(workflow, /: write$/m);
  assert.deepEqual(Object.keys(jobs).sort(), ["signed", "unsigned"]);
  for (const job of Object.values(jobs)) {
    assert.match(job, /if: github\.repository == 'JTCAO515\/VP-V4' && /);
    assert.match(job, /runs-on: \[self-hosted, macOS, ARM64, vp-v4-ios\]/);
    assert.match(job, /persist-credentials: false/);
  }
});

test("signing secrets reach only the signed main-branch job through the testflight environment", () => {
  assert.doesNotMatch(jobs.unsigned, /secrets\./);
  assert.match(jobs.signed, /inputs\.signing == 'api-key' && github\.ref == 'refs\/heads\/main'/);
  assert.match(jobs.signed, /^    environment: testflight$/m);
  const referenced = [...jobs.signed.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((match) => match[1]).sort();
  assert.deepEqual(referenced, ["VP_ASC_ISSUER_ID", "VP_ASC_KEY_ID", "VP_ASC_KEY_P8", "VP_IOS_TEAM_ID"]);
  assert.doesNotMatch(workflow, /\$\{\{ secrets\.[^}]+\}\}[^\n]*\brun:|echo[^\n]*secrets/);
});

test("uploaded artifacts are evidence directories, never the archive or ipa", () => {
  for (const [name, job] of Object.entries(jobs)) {
    const evidence = /--output "\$RUNNER_TEMP\/(vpj-56-archive)-\$GITHUB_RUN_ID-\$GITHUB_RUN_ATTEMPT"/.exec(job);
    assert.ok(evidence, `${name} writes evidence to RUNNER_TEMP`);
    assert.match(job, /path: \$\{\{ runner\.temp \}\}\/vpj-56-archive-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}\n/);
    assert.doesNotMatch(job, /path: [^\n]*(products|\.ipa|\.xcarchive|TestFlight)/);
  }
  assert.doesNotMatch(workflow, /altool|notarytool|--upload|destination.*upload|pilot/);
});

test("existing native simulator gate is unchanged by the archive path", () => {
  const native = readFileSync(".github/workflows/native-ios.yml", "utf8");
  assert.doesNotMatch(native, /archive\.py|secrets\./);
});

test("archive script unit tests pass", () => {
  const result = spawnSync("python3", ["-m", "unittest", "discover", "-s", "scripts/ios", "-p", "test_*.py"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /^OK$/m);
});
