import assert from 'node:assert/strict';
import test from 'node:test';
import { orderedTasks } from '../../../scripts/vpj-program.mjs';

test('VPJ rejects missing blockers and dependency cycles', () => {
  assert.throws(() => orderedTasks([{id:'A',blockedBy:['missing']}]), /unknown dependency/);
  assert.throws(() => orderedTasks([{id:'A',blockedBy:['B']},{id:'B',blockedBy:['A']}]), /dependency cycle/);
});

test('VPJ orders shared prerequisites once before consumers', () => {
  assert.deepEqual(orderedTasks([{id:'C',blockedBy:['A','B']},{id:'B',blockedBy:['A']},{id:'A',blockedBy:[]}]).map(x=>x.id), ['A','B','C']);
  assert.throws(() => orderedTasks([{id:'A',blockedBy:[]},{id:'A',blockedBy:[]}]), /duplicate task/);
});
