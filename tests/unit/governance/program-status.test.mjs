import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { collectStatus, parseArgs, renderStatusMarkdown } from '../../../scripts/program-status.mjs';

const plan = {
  repo: 'example/vp', parentNumber: 187,
  tasks: [
    { id: 'VPJ-01', number: 188, title: 'First | task', deliveryStage: 'S1' },
    { id: 'VPJ-07', number: 195, title: 'Ask', deliveryStage: 'S2' },
    { id: 'VPJ-09', number: 197, title: 'Plan', deliveryStage: 'S3' },
  ],
};

const issue = (number, state, extra = {}) => ({ number, state, title: `#${number}`,
  updated_at: '2026-09-22T00:00:00Z', closed_at: state === 'closed' ? '2026-09-21T00:00:00Z' : null, ...extra });

function fakeGet(calls) {
  const bulk = Array.from({ length: 100 }, (_, i) => issue(1000 + i, 'open', i === 0 ? { pull_request: {} } : {}));
  return async endpoint => {
    calls.push(endpoint);
    if (endpoint === 'repos/example/vp/commits/main') return { sha: 'a'.repeat(40), commit: { message: 'Merge #516\n\nbody', committer: { date: '2026-09-22T06:19:36Z' } } };
    if (endpoint.startsWith('repos/example/vp/issues?state=all')) {
      if (endpoint.endsWith('page=1')) return bulk;
      return [issue(187, 'open'), issue(188, 'closed', { state_reason: 'completed' }), issue(195, 'open'),
        issue(197, 'closed', { state_reason: 'not_planned' }), issue(363, 'open')];
    }
    if (endpoint.startsWith('repos/example/vp/pulls?state=open')) return [
      { number: 514, title: 'b', draft: false, base: { ref: 'main' }, head: { sha: 'c'.repeat(40) }, updated_at: 'u' },
      { number: 478, title: 'a', draft: true, base: { ref: 'main' }, head: { sha: 'd'.repeat(40) }, updated_at: 'u' }];
    if (endpoint.startsWith('repos/example/vp/pulls?state=closed') && !endpoint.endsWith('page=1'))
      return Array.from({ length: 100 }, (_, i) => ({ number: 100 + i, title: 'old', base: { ref: 'main' }, merged_at: '2026-01-01T00:00:00Z', merge_commit_sha: '0'.repeat(40) }));
    if (endpoint.startsWith('repos/example/vp/pulls?state=closed')) return [...Array.from({ length: 97 }, (_, i) => ({ number: 300 + i, title: 'closed', base: { ref: 'main' }, merged_at: null })),
      { number: 479, title: 'older', base: { ref: 'main' }, merged_at: '2026-09-22T00:37:17Z', merge_commit_sha: 'e'.repeat(40) },
      { number: 470, title: 'closed unmerged', base: { ref: 'main' }, merged_at: null },
      { number: 516, title: 'newest', base: { ref: 'main' }, merged_at: '2026-09-22T06:19:37Z', merge_commit_sha: 'f'.repeat(40) }];
    if (endpoint.startsWith('repos/example/vp/deployments?')) return [{ id: 9, sha: '1'.repeat(40), ref: '1'.repeat(40), created_at: '2026-09-16T02:43:48Z' }];
    if (endpoint.startsWith('repos/example/vp/deployments/9/statuses')) return [{ state: 'success', created_at: '2026-09-16T02:43:50Z' }];
    throw new Error(`unexpected ${endpoint}`);
  };
}

test('collects a read-only snapshot with pagination, merged-only PRs and explicit missing issues', async () => {
  const calls = [];
  const status = await collectStatus({ plan, get: fakeGet(calls), merged: 5, extra: [363, 999], now: new Date('2026-09-23T00:00:00Z') });
  assert.ok(calls.some(c => c.endsWith('page=2')), 'issues are paginated');
  assert.ok(!calls.some(c => c.includes('state=closed') && c.endsWith('page=3')), 'closed PR history is truncated, not exhausted');
  assert.ok(calls.every(c => !/[?&](method|_method)=/.test(c)), 'GET-only endpoints');
  assert.deepEqual(status.tasks.map(t => t.state), ['CLOSED', 'OPEN', 'CLOSED']);
  assert.equal(status.tasks[2].stateReason, 'not_planned');
  assert.deepEqual(status.extra.map(r => r.state), ['OPEN', 'MISSING']);
  assert.deepEqual(status.openPulls.map(p => p.number), [478, 514]);
  assert.deepEqual(status.mergedPulls.map(p => p.number), [516, 479, 199, 198, 197], 'newest first, capped at --merged');
  assert.equal(status.productionDeployments[0].latestState, 'success');

  const md = renderStatusMarkdown(status);
  assert.match(md, /main：`aaaaaaa`/);
  assert.match(md, /不等于对应版本、环境或用户行为已验收/);
  assert.match(md, /不代表线上实际提供的版本/);
  assert.match(md, /First \\\| task/, 'table cells are escaped');
  assert.match(md, /CLOSED \(not_planned\)/, 'not_planned is never shown as plain completion');
  assert.match(md, /\| S2 \| 1 \| 1 \| 0 \|/);
  assert.match(md, /#999\]\([^)]+\) MISSING/);
  assert.equal(renderStatusMarkdown(status), md, 'rendering is deterministic');
});

test('argument parsing rejects unknown flags and unbounded requests', () => {
  assert.deepEqual(parseArgs(['--merged', '10', '--out', 'x.md']).merged, 10);
  assert.throws(() => parseArgs(['--merged', '0']), /1\.\.200/);
  assert.throws(() => parseArgs(['--repo', 'bad repo']), /OWNER\/NAME/);
  assert.throws(() => parseArgs(['--write']), /Unknown argument/);
});

test('program status workflow stays read-only, GitHub-hosted and outside PR gates', () => {
  const workflow = readFileSync('.github/workflows/program-status.yml', 'utf8')
    .split('\n').filter(line => !line.trimStart().startsWith('#')).join('\n');
  assert.doesNotMatch(workflow, /pull_request/);
  assert.doesNotMatch(workflow, /self-hosted/);
  assert.match(workflow, /runs-on: ubuntu-latest/);
  const permissions = workflow.match(/^permissions:\n((?: {2}.+\n)+)/m)?.[1] ?? '';
  assert.ok(permissions.trim(), 'explicit permissions block');
  assert.doesNotMatch(permissions, /write/, 'no write permission');
  for (const gate of ['.github/workflows/quality-pr.yml', '.github/workflows/native-ios.yml']) {
    assert.doesNotMatch(readFileSync(gate, 'utf8'), /program-status/, `${gate} must not depend on the GitHub API readback`);
  }
});
