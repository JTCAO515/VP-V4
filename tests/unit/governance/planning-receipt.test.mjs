import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePlanningReceipt } from '../../../scripts/lib/planning-receipt.mjs';

const fixture = () => ({
  schemaVersion: 'vpj-product-experience-sync/1', observedAt: '2026-09-17T01:33:04.025Z',
  planningPr: 433, planCommit: '83921fb', actualProviderCalls: 0, newIssues: 0,
  scope: 'planning-only', closedIssue206: 'untouched, observed closed',
  results: [{ issue: 195, task: 'VPJ-07', url: 'https://github.com/JTCAO515/VP-V4/issues/195',
    addedAcceptance: 2, priorBodyPreserved: true, priorCheckedItems: 1, state: 'open',
    labelsPreserved: true, milestonePreserved: true, nativeDependenciesPreserved: true,
    nativeDependencies: [191, 192, 193, 194] }],
});

test('planning receipt validation is read-only and does not turn recorded failures into success', () => {
  const receipt = fixture(), before = structuredClone(receipt);
  assert.doesNotThrow(() => validatePlanningReceipt(receipt));
  assert.deepEqual(receipt, before);
  receipt.results[0].priorBodyPreserved = false;
  assert.doesNotThrow(() => validatePlanningReceipt(receipt));
  assert.equal(receipt.results[0].priorBodyPreserved, false);
});

test('only bounded metadata is accepted, not runtime payloads, duplicate identities or broken dependency references', () => {
  const mutations = [
    r => { r.runtime = { apiKey: 'SYNTHETIC-NOT-A-SECRET' }; },
    r => { r.actualProviderCalls = 1; }, r => { r.scope = 'runtime'; }, r => { r.newIssues = 1; },
    r => { r.results = []; }, r => { r.results.push(structuredClone(r.results[0])); },
    r => { r.results[0].url = 'https://example.org'; }, r => { r.results[0].priorCheckedItems = -1; },
    r => { r.results[0].nativeDependencies = [195]; }, r => { r.results[0].nativeDependencies = [191, 191]; },
    r => { r.results[0].priorBodyPreserved = 'true'; }, r => { r.results[0].body = 'unexpected full content'; },
    r => { delete r.results[0].state; }, r => { r.planCommit = 'not-a-commit'; },
  ];
  for (const mutate of mutations) {
    const receipt = fixture(); mutate(receipt);
    assert.throws(() => validatePlanningReceipt(receipt), /Invalid planning receipt/);
  }
});
