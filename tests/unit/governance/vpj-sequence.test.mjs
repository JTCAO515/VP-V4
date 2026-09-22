import assert from 'node:assert/strict';
import test from 'node:test';
import { computeSequence, renderSequence } from '../../../scripts/vpj-sequence.mjs';

const task = (id, number, extra = {}) => ({
  id, number, title: `${id} result`, deliveryStage: 'S3', blockedBy: [], ...extra,
});

test('sequence counts only still-open dependencies', () => {
  const tasks = [
    task('A', 1),
    task('B', 2, { acceptanceDependencies: ['A'] }),
    task('C', 3, { acceptanceDependencies: ['CLOSED'] }),
    task('CLOSED', 9),
  ];
  const entries = computeSequence(tasks, new Set([1, 2, 3]), () => 'team:x');
  const wave = Object.fromEntries(entries.map((entry) => [entry.task.id, entry.wave]));
  assert.equal(wave.A, 0);
  assert.equal(wave.B, 1);
  // C's only input is already closed, so it is not held behind anything.
  assert.equal(wave.C, 0);
  assert.equal(entries.find((entry) => entry.task.id === 'C').acceptanceInputs.length, 0);
});

test('a hard blocker keeps a task out of the startable list but an acceptance input does not', () => {
  const tasks = [
    task('A', 1),
    task('HARD', 2, { blockedBy: ['A'] }),
    task('SOFT', 3, { acceptanceDependencies: ['A'] }),
  ];
  const entries = computeSequence(tasks, new Set([1, 2, 3]), () => 'team:journey-experience');
  const rendered = renderSequence(entries, '2026-01-01');
  assert.match(rendered, /其中 2 张没有任何开放的开工硬依赖/);
  assert.match(rendered, /## 有开工硬依赖（1 张）/);
  assert.match(rendered, /HARD/);
  // The document must never present itself as a task definition.
  assert.match(rendered, /不是第二套队列/);
});

test('sequence rejects a cyclic acceptance graph instead of hanging', () => {
  const tasks = [
    task('A', 1, { acceptanceDependencies: ['B'] }),
    task('B', 2, { acceptanceDependencies: ['A'] }),
  ];
  assert.throws(() => computeSequence(tasks, new Set([1, 2]), () => 'team:x'), /acceptance cycle/);
});
