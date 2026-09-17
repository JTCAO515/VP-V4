import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { renderHandoffDocuments, assertHandoffDocuments } from '../../../scripts/lib/handoff-documents.mjs';

const program = { parentNumber: 187, repo: 'example/vp' };
const source = () => ({
  lastUpdated: '2026-09-17', objective: 'A real user result', currentPhase: 'S2',
  status: 'Current scope is incomplete.', nextAction: 'Read the pending PR before continuing.',
  mandatoryReadingOrder: ['docs/agents/development-workflow.md'],
  decisions: ['No new payment authority.'], blockers: ['Waiting for a real interface.'],
  unrun: ['VoiceOver UNRUN.'], verification: ['Synthetic fixture only.'],
  rollback: 'Disable the affected path.', observation: 'No production acceptance.',
  historicalSnapshots: ['docs/archive/previous.json'],
});

test('compact entry preserves the current task verbatim and links to complete authority and unrun records', () => {
  const h = source(), before = structuredClone(h);
  h.verification = Array.from({ length: 100 }, (_, i) => `Historical result ${i}: ${'evidence '.repeat(100)}`);
  const snapshot = structuredClone(h), docs = renderHandoffDocuments(h, program);
  assert.deepEqual(h, snapshot, 'rendering must not prune or rewrite the source');
  for (const value of [h.objective, h.currentPhase, h.status, h.nextAction]) assert.ok(docs.context.includes(value));
  for (const key of ['decisions', 'blockers', 'unrun', 'verification', 'historicalSnapshots']) {
    for (const value of h[key]) assert.ok(docs.handoff.includes(value), `${key} lost`);
  }
  assert.ok(docs.context.includes('HANDOFF.md#未决与运行证据'));
  assert.ok(docs.context.includes('HANDOFF.md#当前决定'));
  assert.ok(!docs.context.includes(h.verification[0]));
  assert.equal(docs.context, renderHandoffDocuments(before, program).context,
    'adding historical evidence must not expand the startup context');
});

test('drift check rejects stale status, missing output and hand-edited evidence without rewriting them', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'vp-handoff-'));
  try {
    mkdirSync(path.join(root, 'docs/program/2026-09-05'), { recursive: true });
    writeFileSync(path.join(root, 'docs/program/2026-09-05/issue-plan.json'), JSON.stringify(program));
    const h = source(), docs = renderHandoffDocuments(h, program);
    const save = () => {
      writeFileSync(path.join(root, 'docs/handoff.json'), JSON.stringify(h));
      const next = renderHandoffDocuments(h, program);
      writeFileSync(path.join(root, 'CONTEXT.md'), next.context);
      writeFileSync(path.join(root, 'HANDOFF.md'), next.handoff);
    };
    save(); assert.doesNotThrow(() => assertHandoffDocuments(root));
    h.status = 'New live-scope observation.';
    writeFileSync(path.join(root, 'docs/handoff.json'), JSON.stringify(h));
    assert.throws(() => assertHandoffDocuments(root), /CONTEXT.md is stale.*render-handoff/);
    assert.equal(readFileSync(path.join(root, 'CONTEXT.md'), 'utf8'), docs.context);
    save();
    writeFileSync(path.join(root, 'HANDOFF.md'), docs.handoff.replace('VoiceOver UNRUN.', 'VoiceOver PASS.'));
    assert.throws(() => assertHandoffDocuments(root), /HANDOFF.md is stale/);
    save(); rmSync(path.join(root, 'CONTEXT.md'));
    assert.throws(() => assertHandoffDocuments(root), /ENOENT/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
