import assert from 'node:assert/strict';

export const PLANNING_RECEIPT_PATH = 'artifacts/VPJ-00/product-experience-20260917/issue-sync.json';

const closed = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const count = value => Number.isSafeInteger(value) && value >= 0;
const positive = value => count(value) && value > 0;

/** Validates a historical planning receipt, not the truth of a live GitHub status. */
export function validatePlanningReceipt(value) {
  const fail = message => assert.ok(false, `Invalid planning receipt: ${message}`);
  if (!closed(value, ['schemaVersion', 'observedAt', 'planningPr', 'planCommit', 'actualProviderCalls',
    'newIssues', 'scope', 'closedIssue206', 'results'])) fail('unexpected or missing fields');
  if (value.schemaVersion !== 'vpj-product-experience-sync/1' || value.scope !== 'planning-only'
    || value.actualProviderCalls !== 0 || value.newIssues !== 0) fail('outside the recorded planning-only scope');
  if (typeof value.observedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value.observedAt)
    || !Number.isFinite(Date.parse(value.observedAt)) || !positive(value.planningPr)
    || typeof value.planCommit !== 'string' || !/^[a-f0-9]{7,40}$/.test(value.planCommit)
    || typeof value.closedIssue206 !== 'string' || !value.closedIssue206.trim() || value.closedIssue206.length > 200) fail('invalid metadata');
  if (!Array.isArray(value.results) || value.results.length < 1 || value.results.length > 76) fail('invalid result list');
  const issues = new Set(), tasks = new Set();
  for (const row of value.results) {
    if (!closed(row, ['issue', 'task', 'url', 'addedAcceptance', 'priorBodyPreserved', 'priorCheckedItems',
      'state', 'labelsPreserved', 'milestonePreserved', 'nativeDependenciesPreserved', 'nativeDependencies'])) fail('invalid result fields');
    if (!positive(row.issue) || row.issue === 206 || typeof row.task !== 'string' || !/^VPJ-\d{2}$/.test(row.task)
      || issues.has(row.issue) || tasks.has(row.task) || row.url !== `https://github.com/JTCAO515/VP-V4/issues/${row.issue}`
      || !positive(row.addedAcceptance) || !count(row.priorCheckedItems) || row.state !== 'open') fail('invalid or duplicate issue');
    for (const key of ['priorBodyPreserved', 'labelsPreserved', 'milestonePreserved', 'nativeDependenciesPreserved']) {
      if (typeof row[key] !== 'boolean') fail('preservation fields must be boolean');
    }
    if (!Array.isArray(row.nativeDependencies) || row.nativeDependencies.length > 76
      || !row.nativeDependencies.every(positive) || new Set(row.nativeDependencies).size !== row.nativeDependencies.length
      || row.nativeDependencies.includes(row.issue)) fail('invalid dependency list');
    issues.add(row.issue); tasks.add(row.task);
  }
}
