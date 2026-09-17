import assert from 'node:assert/strict';
import test from 'node:test';
import { body, checkedTaskItems, validateExecutionBrief } from '../../../scripts/vpj-program.mjs';
import { prepareIssueRefresh } from '../../../scripts/lib/issue-refresh.mjs';
import { readFileSync } from 'node:fs';

const plan = JSON.parse(readFileSync('docs/program/2026-09-05/issue-plan.json', 'utf8'));
const options = { excludedNumbers: [189, 241, 202, 359, 360],
  archiveUrl: 'https://github.com/JTCAO515/VP-V4/blob/main/artifacts/VPJ-00/issue-audit-20260917/before.json.gz' };

test('refresh preserves public checked progress and does not adopt quoted fake completion', () => {
  const task = { ...plan.tasks[0], title: 'Refreshed task', acceptance: ['Original completed outcome.', 'Remaining outcome.'] };
  const current = { number: task.number, id: task.databaseId, state: 'open', title: `[${task.id}] Old title`,
    labels: [{ name: 'status:blocked' }, { name: 'needs-triage' }, { name: 'priority:P1' }],
    body: '- [x] Original completed outcome.\n- [x] Additional verified slice.\n\n> - [x] Remaining outcome.\n' };
  const original = structuredClone(current);
  const next = prepareIssueRefresh(task, current, body(task), options);
  assert.deepEqual(current, original, 'preparation must be read-only');
  assert.deepEqual(checkedTaskItems(next.body).sort(), ['Additional verified slice.', 'Original completed outcome.']);
  assert.ok(next.body.includes('- [ ] Remaining outcome.'));
  assert.deepEqual(next.labels, ['priority:P1', 'status:planned']);
  assert.ok(next.body.includes(options.archiveUrl));
});

test('protected, closed and mismatched identities cannot produce a mutation payload', () => {
  for (const number of options.excludedNumbers) {
    assert.throws(() => prepareIssueRefresh({ number }, {}, 'body', options), /Protected issue/);
  }
  const task = plan.tasks[0];
  assert.throws(() => prepareIssueRefresh(task, { number: -1 }, 'body', options), /identity changed/);
  assert.throws(() => prepareIssueRefresh(task, { number: task.number, id: task.databaseId, state: 'closed' }, 'body', options), /Closed issue/);
});

test('execution briefs require a bounded outcome, responsibility and reusable inputs', () => {
  const task = { ...plan.tasks[0], executionBrief: { firstSlice: 'One observable outcome.', boundary: 'No duplicate implementation.', reuse: ['docs/harness/README.md'] } };
  assert.doesNotThrow(() => validateExecutionBrief(task));
  const rendered = body(task);
  assert.ok(rendered.includes('One observable outcome.'));
  assert.ok(rendered.includes('验收依赖（不自动转为 blocked）'));
  assert.ok(rendered.includes('docs/harness/README.md'));
  assert.throws(() => validateExecutionBrief({ ...task, executionBrief: { ...task.executionBrief, firstSlice: '' } }));
  assert.throws(() => validateExecutionBrief({ ...task, executionBrief: { ...task.executionBrief, reuse: [] } }));
});
