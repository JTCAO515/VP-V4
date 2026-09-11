import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyChanges, detectScope } from '../../../scripts/ci-change-scope.mjs';

test('only bounded documentation pull requests use the smaller check set', () => {
  assert.equal(classifyChanges(['README.md', 'docs/agents/development-workflow.md',
    'docs/program/2026-09-05/issue-plan.json'], 'pull_request'), 'documentation');
  assert.equal(classifyChanges(['README.md'], 'workflow_dispatch'), 'full');
  assert.equal(classifyChanges([], 'pull_request'), 'full');
});

test('runtime, contracts, unknown files and both sides of moves retain full checks', () => {
  for (const file of ['app/page.tsx', 'ios/VisePanda/App.swift', 'public/assets/image.png',
    'docs/contracts/vpj-04.md', 'docs/policy/policy.json', 'docs/adr/ADR-new.md',
    '.github/workflows/quality-pr.yml', 'scripts/ci-change-scope.mjs', 'package.json',
    'pnpm-lock.yaml', 'tests/unit/new.test.mjs', 'docs/new-guide.md']) {
    assert.equal(classifyChanges(['README.md', file], 'pull_request'), 'full', file);
  }
  assert.equal(classifyChanges(['lib/server/moved.ts', 'docs/agents/moved.md'], 'pull_request'), 'full');
});

test('missing, invalid or unavailable comparison inputs fall back to the complete gate', () => {
  assert.equal(detectScope({}), 'full');
  assert.equal(detectScope({ VP_CI_EVENT: 'pull_request', VP_CI_BASE: '--help', VP_CI_HEAD: 'a'.repeat(40) }), 'full');
  assert.equal(detectScope({ VP_CI_EVENT: 'pull_request', VP_CI_BASE: '0'.repeat(40), VP_CI_HEAD: 'f'.repeat(40) }), 'full');
});
