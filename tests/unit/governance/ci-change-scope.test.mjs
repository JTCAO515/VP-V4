import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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
    'pnpm-lock.yaml', 'tests/unit/new.test.mjs', 'docs/new-guide.md',
    'artifacts/VPJ-00/other/issue-sync.json', 'artifacts/VPJ-16/fixture.json',
    'docs/program/2026-09-05/unknown.json', 'docs/program/2026-09-05/UNKNOWN.md']) {
    assert.equal(classifyChanges(['README.md', file], 'pull_request'), 'full', file);
  }
  assert.equal(classifyChanges(['lib/server/moved.ts', 'docs/agents/moved.md'], 'pull_request'), 'full');
});

test('the known product-planning set uses documentation checks, while a single runtime change retains full checks', () => {
  const files = ['docs/VISEPANDA-MASTER-PLAN-2026-09-05.md',
    'docs/program/2026-09-05/PRODUCT-EXPERIENCE-2026-09-17.md',
    'docs/program/2026-09-05/BRAND-ALIGNMENT-EXECUTION.md',
    'artifacts/VPJ-00/product-experience-20260917/issue-sync.json', 'docs/handoff.json'];
  assert.equal(classifyChanges(files, 'pull_request'), 'documentation');
  assert.equal(classifyChanges([...files, 'lib/server/identity/user-data-adapter.ts'], 'pull_request'), 'full');
  assert.equal(classifyChanges([...files, 'supabase/migrations/new.sql'], 'pull_request'), 'full');
  assert.equal(classifyChanges(files, 'workflow_dispatch'), 'full');
});

test('actual Git comparison includes both sides of a runtime-to-document rename', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'vp-ci-scope-'));
  const moduleUrl = pathToFileURL(path.resolve('scripts/ci-change-scope.mjs')).href;
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = () => { git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test',
    '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture'); return git('rev-parse', 'HEAD'); };
  const scope = (base, head) => execFileSync(process.execPath, ['--input-type=module', '-e',
    `import {detectScope} from ${JSON.stringify(moduleUrl)}; console.log(detectScope(${JSON.stringify({ VP_CI_EVENT: 'pull_request', VP_CI_BASE: base, VP_CI_HEAD: head })}));`],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git('init'); mkdirSync(path.join(root, 'lib'), { recursive: true });
    mkdirSync(path.join(root, 'docs/agents'), { recursive: true });
    writeFileSync(path.join(root, 'README.md'), 'before\n');
    writeFileSync(path.join(root, 'lib/runtime.ts'), 'export const value = 1;\n');
    const base = commit();
    writeFileSync(path.join(root, 'README.md'), 'after\n');
    const docs = commit(); assert.equal(scope(base, docs), 'documentation');
    git('mv', 'lib/runtime.ts', 'docs/agents/moved.md');
    const moved = commit(); assert.equal(scope(docs, moved), 'full');
    assert.equal(scope('0'.repeat(40), moved), 'full');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('missing, invalid or unavailable comparison inputs fall back to the complete gate', () => {
  assert.equal(detectScope({}), 'full');
  assert.equal(detectScope({ VP_CI_EVENT: 'pull_request', VP_CI_BASE: '--help', VP_CI_HEAD: 'a'.repeat(40) }), 'full');
  assert.equal(detectScope({ VP_CI_EVENT: 'pull_request', VP_CI_BASE: '0'.repeat(40), VP_CI_HEAD: 'f'.repeat(40) }), 'full');
});
