import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { executionContractHeader, validateRemoteTaskState } from '../../../scripts/vpj-program.mjs';

const task = { id: 'VPJ-01' };
const issue = (state = 'open', labels = ['status:blocked'], reason = null) => ({
  state, state_reason: reason, labels: labels.map(name => ({ name })),
});

test('unmerged baseline retains the migration gate', () => {
  assert.equal(validateRemoteTaskState(task, issue(), { baselineMerged: false }), 'baseline-blocked');
  assert.throws(() => validateRemoteTaskState(task, issue('open', ['status:ready']), { baselineMerged: false }), /must remain blocked/);
  assert.throws(() => validateRemoteTaskState(task, issue('closed', [], 'completed'), { baselineMerged: false }), /must be open/);
});

test('merged baseline permits ready work and completed tasks', () => {
  assert.equal(validateRemoteTaskState(task, issue('open', ['status:ready', 'ready-for-agent']), { baselineMerged: true }), 'open');
  assert.equal(validateRemoteTaskState(task, issue('closed', [], 'completed'), { baselineMerged: true }), 'completed');
});

test('blocked tasks without open dependencies require review, not automatic readiness', () => {
  const candidate = issue();
  const before = structuredClone(candidate);
  assert.equal(validateRemoteTaskState(task, candidate, { baselineMerged: true }), 'readiness-review');
  assert.deepEqual(candidate, before);
});

test('runtime readiness still rejects open and cancelled upstream dependencies', () => {
  for (const blocker of [issue(), issue('closed', [], 'not_planned')]) {
    assert.throws(() => validateRemoteTaskState(task, issue('open', ['status:ready']), {
      baselineMerged: true, blockers: [blocker],
    }), /unresolved native blockers/);
  }
  assert.equal(validateRemoteTaskState(task, issue('open', ['status:in-progress']), {
    baselineMerged: true, blockers: [issue('closed', [], 'completed')],
  }), 'open');
  assert.equal(validateRemoteTaskState(task, issue(), {
    baselineMerged: true, blockers: [issue()],
  }), 'open');
});

test('not-planned is not silently treated as product completion', () => {
  assert.throws(() => validateRemoteTaskState(task, issue('closed', [], 'not_planned'), {
    baselineMerged: true,
  }), /closed without completion/);
});

test('closed tasks with open upstream scope are surfaced for evidence review without inventing acceptance', () => {
  for (const blocker of [issue(), issue('closed', [], 'not_planned')]) {
    assert.equal(validateRemoteTaskState(task, issue('closed', [], 'completed'), {
      baselineMerged: true, blockers: [blocker],
    }), 'completion-evidence-review');
  }
  assert.equal(validateRemoteTaskState(task, issue('closed', [], 'completed'), {
    baselineMerged: true, blockers: [issue('closed', [], 'completed')],
  }), 'completed');
});

test('ongoing slices with unfinished upstream scope require input review, not automatic blocking', () => {
  const current = issue('open', ['status:in-progress']);
  const original = structuredClone(current);
  assert.equal(validateRemoteTaskState(task, current, { baselineMerged: true, blockers: [issue()] }), 'active-input-review');
  assert.deepEqual(current, original);
});

test('completed tasks cannot retain active status or ready-for labels', () => {
  for (const label of ['status:planned', 'status:blocked', 'status:ready', 'status:in-progress', 'ready-for-agent', 'ready-for-human']) {
    assert.throws(() => validateRemoteTaskState(task, issue('closed', [label], 'completed'), {
      baselineMerged: true,
    }), /completed with active readiness labels/);
  }
});

test('planned work may retain unresolved acceptance dependencies without claiming readiness', () => {
  assert.equal(validateRemoteTaskState(task, issue('open', ['status:planned']), {
    baselineMerged: true, blockers: [issue()],
  }), 'open');
  assert.throws(() => validateRemoteTaskState(task, issue('open', ['status:planned', 'ready-for-agent']), {
    baselineMerged: true, blockers: [issue()],
  }), /unresolved native blockers/);
});

test('closing old tasks still demands a strict new-task migration snapshot', () => {
  const options = { baselineMerged: true, migrationSnapshot: true };
  assert.equal(validateRemoteTaskState(task, issue(), options), 'baseline-blocked');
  assert.throws(() => validateRemoteTaskState(task, issue('closed', [], 'completed'), options), /must be open/);
  assert.throws(() => validateRemoteTaskState(task, issue('open', ['status:ready']), options), /must remain blocked/);
});

test('published execution header stays synchronized with the generator', () => {
  const generated = readFileSync('docs/program/2026-09-05/EXECUTION-CONTRACT.md', 'utf8');
  assert.equal(generated.slice(0, generated.indexOf('## VPJ-')), executionContractHeader);
});
