import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { body, executionContractRow, orderedTasks, renderDeliveryStages, validateDeliveryStages } from '../../../scripts/vpj-program.mjs';

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

test('VPJ default execution links use main without treating a historical PR as pending', () => {
  const task = { ...plan.tasks[0], sourceRef: undefined, baselineNote: undefined };
  const generated = body(task);
  assert.ok(generated.includes(`/blob/main/${planDir}/EXECUTION-CONTRACT.md`));
  assert.ok(generated.includes(`/blob/main/${task.contract}`));
  assert.ok(!generated.includes(`/blob/${plan.baselineBranch}/`));
  assert.ok(!generated.includes('合并前不要从旧main实施新合同'));
  assert.ok(generated.includes('本计划定义不代表任务已就绪或已验收'));
});

test('VPJ body supports a task source ref and its own planning merge gate', () => {
  const baselineNote = '本轮规划合并 main 后才可开始；历史基线 PR 的合并不代表本轮就绪。';
  const task = { ...plan.tasks[0], id: 'VPJ-66', contract: 'docs/harness/README.md', sourceRef: '8ae95a7', baselineNote };
  const generated = body(task);
  assert.ok(generated.includes(`## 当前基线与开发入口\n\n${baselineNote}\n`));
  assert.ok(generated.includes(`/blob/8ae95a7/${planDir}/EXECUTION-CONTRACT.md#vpj-66`));
  assert.ok(generated.includes('/blob/8ae95a7/docs/harness/README.md'));
  assert.ok(!generated.includes(`/blob/${plan.baselineBranch}/`));
  assert.ok(!generated.includes(`基线PR：#${plan.baselinePr}。`));
});

function stagedPlan() {
  return {
    repo: 'owner/repo',
    deliveryStages: [
      { id: 'S1', title: 'First usable result', acceptance: ['A user can read the saved result.'] },
      { id: 'S2', title: 'Confirmed change', acceptance: ['Only the confirmed change is saved.'], ongoingIssueNumbers: [1] },
      { id: 'expand', title: 'Evidence-triggered expansion', acceptance: ['The activation evidence exists.'] },
    ],
    tasks: [
      { id: 'A', number: 1, title: 'Read a result', track: 'launch', deliveryStage: 'S1', blockedBy: [], acceptance: ['Read works.'] },
      { id: 'B', number: 2, title: 'Confirm a change', track: 'launch', deliveryStage: 'S2', blockedBy: ['A'], acceptance: ['Confirm works.'] },
      { id: 'C', number: 3, title: 'Reload the same change', track: 'launch', deliveryStage: 'S2', blockedBy: ['B'], acceptance: ['Reload works.'] },
      { id: 'D', number: 4, title: 'Expand with evidence', track: 'expand', deliveryStage: 'expand', blockedBy: ['C'], acceptance: ['Evidence exists.'] },
      { id: 'E', number: 5, title: 'Continue expansion', track: 'expand', deliveryStage: 'expand', blockedBy: ['D'], acceptance: ['Evidence still applies.'] },
    ],
  };
}

test('delivery stages permit earlier and same-stage prerequisites without mutating task definitions', () => {
  const fixture = stagedPlan();
  const before = structuredClone(fixture);
  validateDeliveryStages(fixture);
  assert.deepEqual(fixture, before, 'stage validation must preserve identities, dependencies and acceptance');
  validateDeliveryStages(plan);
});

test('delivery stages reject missing assignments, unknown stages and duplicate definitions', () => {
  const missing = stagedPlan();
  delete missing.tasks[0].deliveryStage;
  assert.throws(() => validateDeliveryStages(missing), /A missing delivery stage/);
  const unknown = stagedPlan();
  unknown.tasks[0].deliveryStage = 'unknown';
  assert.throws(() => validateDeliveryStages(unknown), /A unknown delivery stage/);
  const duplicate = stagedPlan();
  duplicate.deliveryStages.push({ ...duplicate.deliveryStages[0] });
  assert.throws(() => validateDeliveryStages(duplicate), /duplicate delivery stage S1/);
  assert.throws(() => validateDeliveryStages({ ...stagedPlan(), deliveryStages: [] }), /missing delivery stages/);
});

test('delivery stages reject backward dependency order and keep expansion outside launch', () => {
  const backward = stagedPlan();
  backward.tasks[0].deliveryStage = 'S2';
  backward.tasks[1].deliveryStage = 'S1';
  assert.throws(() => validateDeliveryStages(backward), /B delivery stage S1 precedes dependency A in S2/);
  const launchAsExpand = stagedPlan();
  launchAsExpand.tasks[2].deliveryStage = 'expand';
  assert.throws(() => validateDeliveryStages(launchAsExpand), /C launch task cannot use expand stage/);
  const expandAsLaunch = stagedPlan();
  expandAsLaunch.tasks[3].deliveryStage = 'S2';
  assert.throws(() => validateDeliveryStages(expandAsLaunch), /D expand task must use expand stage/);
  const earlyExpand = stagedPlan();
  earlyExpand.deliveryStages.unshift(earlyExpand.deliveryStages.pop());
  assert.throws(() => validateDeliveryStages(earlyExpand), /expand must follow launch delivery stages/);
});

test('stage view reuses existing Issues and makes its completion boundary explicit', () => {
  const fixture = stagedPlan();
  const generated = renderDeliveryStages(fixture);
  for (const task of fixture.tasks) {
    assert.ok(generated.includes(`https://github.com/owner/repo/issues/${task.number}`));
    assert.ok(generated.includes(task.title));
  }
  for (const stage of fixture.deliveryStages) {
    assert.ok(generated.includes(`## ${stage.id}\n`));
    for (const criterion of stage.acceptance) assert.ok(generated.includes(criterion));
  }
  assert.ok(generated.includes('阶段演示不等于整票验收或关闭'));
  assert.ok(generated.includes('独立准备可以跨阶段推进'));
  assert.ok(generated.includes('持续配合：[#1](https://github.com/owner/repo/issues/1)'));
});

test('compact Issue bodies keep task-specific acceptance and guardrails with full execution details reachable', () => {
  for (const task of plan.tasks) {
    const generated = body(task);
    const execution = executionContractRow(task);
    for (const criterion of task.acceptance) assert.ok(generated.includes(`- [ ] ${criterion}`), `${task.id} lost acceptance`);
    for (const guardrail of task.doNotTouch) assert.ok(generated.includes(`- ${guardrail}`), `${task.id} lost guardrail`);
    for (const dependency of [...task.blockedBy, ...(task.acceptanceDependencies ?? [])]) assert.ok(generated.includes(`[${dependency} #`), `${task.id} lost dependency`);
    assert.ok(generated.includes(`/EXECUTION-CONTRACT.md#${task.id.toLowerCase()}`));
    assert.ok(generated.includes('/docs/agents/development-workflow.md'));
    for (const field of ['allowedPaths', 'checks', 'artifactPaths', 'docsImpact', 'externalPrerequisites']) {
      for (const detail of task[field]) assert.ok(execution.includes(detail), `${task.id} lost ${field}`);
    }
    for (const field of ['owner', 'kind', 'observationWindow', 'rollback', 'nativeVerification', 'activationEvidence']) {
      if (task[field]) assert.ok(execution.includes(task[field]), `${task.id} lost ${field}`);
    }
    if (task.activationEvidence) assert.ok(generated.includes(task.activationEvidence), `${task.id} hid activation evidence`);
    assert.ok(!generated.includes('## Scope 与接口'), `${task.id} duplicates execution scope`);
    assert.ok(!generated.includes('## 验证与证据'), `${task.id} duplicates execution checks`);
  }
});

test('acceptance-only dependencies retain ordering, missing-node and mixed-cycle validation', () => {
  assert.deepEqual(orderedTasks([
    { id: 'B', blockedBy: [], acceptanceDependencies: ['A'] },
    { id: 'A', blockedBy: [] },
  ]).map(t => t.id), ['A', 'B']);
  assert.throws(() => orderedTasks([{ id: 'A', blockedBy: [], acceptanceDependencies: ['missing'] }]), /unknown dependency/);
  assert.throws(() => orderedTasks([
    { id: 'A', blockedBy: ['B'] }, { id: 'B', blockedBy: [], acceptanceDependencies: ['A'] },
  ]), /dependency cycle/);
  assert.throws(() => orderedTasks([{ id: 'A', blockedBy: ['B'], acceptanceDependencies: ['B'] }]), /duplicate dependency/);
  assert.throws(() => orderedTasks([{ id: 'A', blockedBy: [], acceptanceDependencies: 'B' }]), /invalid dependency list/);
  const backward = stagedPlan();
  backward.tasks[0].deliveryStage = 'S2';
  backward.tasks[1].deliveryStage = 'S1';
  backward.tasks[1].acceptanceDependencies = backward.tasks[1].blockedBy;
  backward.tasks[1].blockedBy = [];
  assert.throws(() => validateDeliveryStages(backward), /precedes dependency/);
});
