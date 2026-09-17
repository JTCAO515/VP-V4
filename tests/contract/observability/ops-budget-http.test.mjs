import test from 'node:test';
import assert from 'node:assert/strict';
import { handleOpsBudgetRead } from '../../../lib/server/observability/ops-budget-http.ts';

const scopeId = '11111111-1111-4111-8111-111111111111';
const request = (query, headers = {}) => new Request(`https://example.test/api/ops/budget${query}`, { headers });

test('Ops budget route rejects invalid scope and ambiguous credentials before RPC', async () => {
  let calls = 0;
  const options = { enabled: true, createRpc() { calls++; throw new Error('must not run'); } };
  assert.equal((await handleOpsBudgetRead(request(''), options)).status, 400);
  assert.equal((await handleOpsBudgetRead(request('?scopeId=bad'), options)).status, 400);
  assert.equal((await handleOpsBudgetRead(request(`?scopeId=${scopeId}&other=1`), options)).status, 400);
  assert.equal((await handleOpsBudgetRead(request(`?scopeId=${scopeId}`, { authorization: 'Bearer synthetic' }), options)).status, 401);
  assert.equal(calls, 0);
});

test('Ops budget route does not reveal RPC errors or dispatch after auth denial', async () => {
  const url = request(`?scopeId=${scopeId}`);
  const denied = await handleOpsBudgetRead(url, { enabled: true, createRpc: () => ({ authenticate: async () => false, call: () => { throw new Error('must not call'); } }) });
  assert.equal(denied.status, 401);
  const broken = await handleOpsBudgetRead(url, { enabled: true, createRpc: () => ({ authenticate: async () => scopeId, call: async () => ({ data: null, error: { message: 'private-database-detail' } }) }) });
  assert.equal(broken.status, 503); assert.doesNotMatch(JSON.stringify(broken), /private-database-detail/);
});

test('Ops budget route calls the member RPC and returns only validated metadata', async () => {
  const counts = { total: 1, reserved: 0, dispatched: 0, pending: 1, settled: 0, released: 0 };
  const money = { settledMicros: '0', holdMicros: '100', exposureMicros: '100' };
  const snapshot = {
    kind: 'snapshot', schemaVersion: 'ops-budget-scope/v1', observedAt: '2026-09-17T00:00:00Z',
    scope: { currency: 'CNY', enabled: true, frozen: false, expired: false }, attempts: counts, money,
    providers: [{ provider: 'qwen', attempts: counts, money }],
    tasks: { total: 1, linkedTurns: 0, missingTurns: 1, ownerMismatch: 0,
      technical: { active: 0, completed: 0, proposalReady: 0, unavailable: 0, failed: 0, cancelled: 0, unknown: 1 },
      business: { answered: 0, partial: 0, clarification: 0, blocked: 0, technicalFailure: 0, unobserved: 1 } },
    integrity: { inconsistentOutcomeTasks: 0, duplicateTerminalTasks: 0 },
    unobserved: { actualBilledMicros: null, providerLatencyMs: null, toolAttempts: null, humanTimeMs: null, semanticQuality: null, serviceTaskCount: null },
  };
  const calls = [];
  const result = await handleOpsBudgetRead(request(`?scopeId=${scopeId}`), { enabled: true, createRpc: () => ({
    authenticate: async () => scopeId,
    call: async (name, input) => { calls.push([name, input]); return { data: snapshot, error: null }; },
  }) });
  assert.equal(result.status, 200);
  assert.deepEqual(calls, [['ops_budget_scope_read_v1', { p_scope_id: scopeId }]]);
  assert.deepEqual(result.body.data.findings, ['unknown_cost_hold', 'unlinked_tasks']);
  assert.equal(result.body.data.snapshot.unobserved.actualBilledMicros, null);
  assert.doesNotMatch(JSON.stringify(result.body), new RegExp(scopeId));
});
