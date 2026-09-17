import test from 'node:test';
import assert from 'node:assert/strict';
import {citedWithdrawnSources} from '../../../lib/server/knowledge/wiki/read-model.ts';

// citedWithdrawnSources is the pure, read-only "cascading" correlation named as an
// explicit gap in artifacts/VPJ-75/unrun.md: it does not touch any table, RPC or
// migration -- it only re-derives, from fields ops_wiki_read_v1 already returns on
// every revision's sources[] (migration 20260917100000), which of a SPECIFIC
// already-generated revision's cited sources have since been withdrawn, so
// /ops/wiki can flag this prominently at the revision level instead of only
// inside the per-source note buried in a collapsed details block.

const activeSource = {id: 'a1111111-1111-4111-8111-111111111111', missing: false, snippetHash: 'a'.repeat(64), lineageStatus: null,
  withdrawnAt: null, withdrawnBy: null, withdrawalReason: null, declaration: null};
const withdrawnSource = {id: 'b2222222-2222-4222-8222-222222222222', missing: false, snippetHash: 'b'.repeat(64), lineageStatus: null,
  withdrawnAt: '2026-09-17T09:42:45.000Z', withdrawnBy: 'c3333333-3333-4333-8333-333333333333', withdrawalReason: 'Publisher retracted the article.', declaration: null};
const missingSource = {id: 'd4444444-4444-4444-8444-444444444444', missing: true, snippetHash: null, lineageStatus: null,
  withdrawnAt: null, withdrawnBy: null, withdrawalReason: null, declaration: null};

test('a revision whose sources were never withdrawn returns an empty, order-preserving array', () => {
  assert.deepEqual(citedWithdrawnSources([]), []);
  assert.deepEqual(citedWithdrawnSources([activeSource]), []);
  assert.deepEqual(citedWithdrawnSources([activeSource, missingSource]), []);
});

test('a revision citing a withdrawn source surfaces exactly that source\'s id/who/when/reason, never mutating or dropping the others', () => {
  const result = citedWithdrawnSources([activeSource, withdrawnSource, missingSource]);
  assert.deepEqual(result, [{
    id: withdrawnSource.id,
    withdrawnAt: withdrawnSource.withdrawnAt,
    withdrawnBy: withdrawnSource.withdrawnBy,
    withdrawalReason: withdrawnSource.withdrawalReason,
  }]);
});

test('multiple withdrawn sources on the same revision are all surfaced, in source order', () => {
  const secondWithdrawn = {...withdrawnSource, id: 'e5555555-5555-4555-8555-555555555555', withdrawalReason: 'A different reason.'};
  const result = citedWithdrawnSources([withdrawnSource, activeSource, secondWithdrawn]);
  assert.deepEqual(result.map(s => s.id), [withdrawnSource.id, secondWithdrawn.id]);
  assert.equal(result[1].withdrawalReason, 'A different reason.');
});
