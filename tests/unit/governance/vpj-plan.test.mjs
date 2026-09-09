import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { body, orderedTasks } from '../../../scripts/vpj-program.mjs';

const planDir = 'docs/program/2026-09-05';
const plan = JSON.parse(readFileSync(`${planDir}/issue-plan.json`, 'utf8'));

test('VPJ rejects missing blockers and dependency cycles', () => {
  assert.throws(() => orderedTasks([{id:'A',blockedBy:['missing']}]), /unknown dependency/);
  assert.throws(() => orderedTasks([{id:'A',blockedBy:['B']},{id:'B',blockedBy:['A']}]), /dependency cycle/);
});

test('VPJ orders shared prerequisites once before consumers', () => {
  assert.deepEqual(orderedTasks([{id:'C',blockedBy:['A','B']},{id:'B',blockedBy:['A']},{id:'A',blockedBy:[]}]).map(x=>x.id), ['A','B','C']);
  assert.throws(() => orderedTasks([{id:'A',blockedBy:[]},{id:'A',blockedBy:[]}]), /duplicate task/);
});

test('VPJ bodies without task overrides preserve their published output', () => {
  const legacyTasks = plan.tasks.filter(task => task.sourceRef === undefined && task.baselineNote === undefined);
  assert.ok(legacyTasks.length > 0);
  for (const task of legacyTasks) {
    assert.equal(body(task), readFileSync(`${planDir}/issue-bodies/${task.id}.md`, 'utf8'), task.id);
  }
});

test('VPJ body supports a task source ref and its own planning merge gate', () => {
  const baselineNote = '本轮规划合并 main 后才可开始；历史基线 PR 的合并不代表本轮就绪。';
  const task = { ...plan.tasks[0], id: 'VPJ-66', contract: 'docs/harness/README.md', sourceRef: 'main', baselineNote };
  const generated = body(task);
  assert.ok(generated.includes(`## 当前基线与开发入口\n\n${baselineNote}\n`));
  assert.ok(generated.includes(`/blob/main/${planDir}/EXECUTION-CONTRACT.md#vpj-66`));
  assert.ok(generated.includes('/blob/main/docs/harness/README.md'));
  assert.ok(!generated.includes(`/blob/${plan.baselineBranch}/`));
  assert.ok(!generated.includes(`基线PR：#${plan.baselinePr}。`));
});
