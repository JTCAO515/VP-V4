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

test("CI exact toolchain qualification does not widen the Archive gate", () => {
  const code = String.raw`
import json, os, sys, tempfile
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, 'scripts/ios')
import ci, archive
legacy = frozenset({'Xcode 26.6\nBuild version 17F113', 'Xcode 27.0\nBuild version 27A266a'})
current = 'Xcode 27.1\nBuild version 27A9275'
assert ci.XCODE_VERSIONS == archive.XCODE_VERSIONS == legacy
assert current not in archive.XCODE_VERSIONS
assert ci.RUNTIME == 'com.apple.CoreSimulator.SimRuntime.iOS-26-5'
assert ci.DEVICE == 'iPhone 17 Pro'
observed = []
with tempfile.TemporaryDirectory() as temporary:
    for index, version in enumerate([*sorted(legacy), current, 'Xcode 27.1\nBuild version 27A9276', 'Xcode 28.0\nBuild version UNKNOWN']):
        calls = []
        def run(command, **kwargs):
            calls.append(command)
            if command == ['xcodebuild', '-version']: output = version
            elif command == ['xcodebuild', '-list', '-project', ci.PROJECT]: output = 'synthetic project listing'
            elif command == ['git', 'rev-parse', 'HEAD']: output = 'a' * 40
            else: raise AssertionError('Unexpected build, signing, Simulator or archive command: ' + repr(command))
            return type('Result', (), {'returncode': 0, 'stdout': output})()
        output = Path(temporary) / str(index)
        with patch.object(sys, 'argv', ['ci.py', '--output', str(output), '--preflight', '--build-only']), patch.dict(os.environ, {'DEVELOPER_DIR': temporary}), patch.object(ci.subprocess, 'run', side_effect=run):
            if version in legacy or version == current:
                ci.main()
                metadata = json.loads((output / 'environment.json').read_text())
                assert metadata['xcode'] == version and metadata['simulatorTestsRun'] is False
                assert metadata['distributionSigned'] is False
            else:
                try: ci.main()
                except RuntimeError as error: assert 'no automatic fallback' in str(error)
                else: raise AssertionError('Unknown version/build was accepted')
                assert calls == [['xcodebuild', '-version']]
                assert not (output / 'environment.json').exists()
        observed.append(version)
assert ci.XCODE_VERSIONS == archive.XCODE_VERSIONS == legacy
print('PASS exact CI qualification, wrong-build refusal and unchanged Archive scope')
`;
  const result = spawnSync("python3", ["-c", code], {
    encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /PASS exact CI qualification, wrong-build refusal and unchanged Archive scope/);
});

test("archive script unit tests pass", () => {
  const result = spawnSync("python3", ["-m", "unittest", "discover", "-s", "scripts/ios", "-p", "test_*.py"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /^OK$/m);
});
