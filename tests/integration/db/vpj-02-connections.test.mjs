import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('operator SQL connection helper security and result contracts', () => {
  const result = spawnSync('python3', ['-B', 'scripts/db/vpj-02-connection-check.test.py'], { encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.stderr || 'Python3 helper tests unavailable');
});
