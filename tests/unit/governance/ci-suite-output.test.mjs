import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

for (const succeeds of [false, true]) test(`CI suite preserves large piped output and actual ${succeeds ? 'passing' : 'failing'} outcome`, t => {
  const root = mkdtempSync(join(tmpdir(), 'vpj650-suite-output-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'tests/contract'), { recursive: true });
  writeFileSync(join(root, 'run-ci-suite.mjs'), readFileSync(new URL('../../../scripts/run-ci-suite.mjs', import.meta.url)));
  writeFileSync(join(root, 'tests/contract/output.test.mjs'), `import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('bounded large output',()=>{console.log('x'.repeat(200000));assert.equal(${succeeds ? 1 : 0},1,'INTENTIONAL_TAIL_FAILURE');});\n`);
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // This is a fresh CLI, not a nested Node test worker.
  const result = spawnSync(process.execPath, [join(root, 'run-ci-suite.mjs'), 'contract'], { cwd: root, encoding: 'utf8', env });
  assert.equal(result.error, undefined);
  assert.equal(result.status, succeeds ? 0 : 1);
  assert.equal(result.stdout.length > 200000, true, 'complete child TAP must survive stdout backpressure');
  assert.equal(result.stdout.includes(`VP_CI_SUITE_RESULT {"suite":"contract","outcome":"${succeeds ? 'passed' : 'failed'}","skipped":0,"testFiles":1}`), true, 'real outcome must be visible at the output tail');
  if (!succeeds) {
    assert.equal(result.stdout.includes('INTENTIONAL_TAIL_FAILURE'), true, 'tail assertion detail must survive');
    assert.equal(result.stdout.includes('# fail 1'), true);
  }
});
