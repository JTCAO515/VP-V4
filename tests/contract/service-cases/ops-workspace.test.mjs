import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID, createHash} from 'node:crypto';
import {ServiceOpsController, canAct, decodeMarker, receiptMatches} from '../../../app/ops/service/controller.ts';
import {handleServiceOperations} from '../../../lib/server/service-cases/operations/http.ts';

const now = Date.now();
const actorId = randomUUID(), sessionId = randomUUID(), caseId = randomUUID();
const identity = {actorId, sessionId, expiresAt: now + 60000};
const capacity = {state: 'available', checkedAt: now};
function projection(extra = {}) { return {caseId, revision: 1, grantRevision: 2, status: 'queued', category: 'general', problem: 'Synthetic granted problem only', grantState: 'active', expiresAt: now + 30000, updatedAt: now, urgency: 'normal', capacity, staff: null, brief: {kind: 'unknown'}, sources: {kind: 'unknown'}, trip: {kind: 'unknown'}, evidence: [], manualMinutes: 0, manualMinutesScope: 'recorded_only', proposal: null, ...extra}; }
function workspace(extra = {}) { return {actorId, surface: 'staff', cases: [projection()], capacity, complete: true, ...extra}; }
const command = () => ({action: 'accept', operationId: randomUUID(), caseId, expectedRevision: 1, grantRevision: 2});
function receipt(input, bytes) { return {operationId: input.operationId, requestDigest: createHash('sha256').update(bytes).digest('hex'), action: input.action, outcome: 'applied', caseId, revision: 2, grantRevision: 2, createdAt: now}; }
function harness(options = {}) {
  let id = identity, clock = now, saved = null, w = workspace();
  const calls = [];
  const controller = new ServiceOpsController({identity: async () => id, now: () => clock, changed() {}, save(p) { if (options.storageFails) throw Error('storage'); saved = p; }, async send(bytes, current) {
    const input = JSON.parse(bytes); calls.push({input, bytes, current});
    if (options.send) return options.send(input, bytes, current, controller);
    if (input.action === 'workspace') return {ok: true, data: w};
    if (input.action === 'read_operation') return {ok: true, data: {receipt: null}};
    throw Error('lost acknowledgement');
  }}, options.marker ?? null, options.blocked ?? false);
  return {controller, calls, saved: () => saved, identity: next => { id = next; }, time: next => { clock = next; }, workspace: next => { w = next; }};
}
test('unknown ACK dispatches once; absent receipt keeps original marker and blocks new accept', async () => {
  const h = harness(); await h.controller.refresh(); const cmd = command(); await h.controller.mutate(cmd);
  assert.ok(h.saved()); assert.equal(h.controller.snapshot().message, 'unknown');
  assert.equal(h.calls.filter(c => c.input.action === 'accept').length, 1);
  await h.controller.mutate(command()); await h.controller.recover();
  assert.equal(h.calls.filter(c => c.input.action === 'accept').length, 1);
  assert.equal(h.controller.snapshot().pending.operationId, cmd.operationId);
  assert.equal(h.controller.snapshot().workspace, null);
  const marker = JSON.stringify(h.saved()); assert.ok(!marker.includes('problem')); assert.ok(!marker.includes('evidence')); assert.ok(!marker.includes('mutationBytes'));
});
test('abandon transmits exact original bytes and same session, never a second accept', async () => {
  const h = harness(); await h.controller.refresh(); await h.controller.mutate(command());
  const original = h.calls.find(c => c.input.action === 'accept').bytes;
  assert.equal(h.controller.canAbandon(), true); await h.controller.recover(true);
  const abandon = h.calls.find(c => c.input.action === 'abandon'); assert.equal(abandon.input.mutationBytes, original); assert.deepEqual(abandon.current, identity);
});
test('page exit/reload preserves minimal marker; original bytes lost allows read only', async () => {
  const h = harness(); await h.controller.refresh(); await h.controller.mutate(command());
  h.controller.invalidate(); assert.equal(h.controller.canAbandon(), false); assert.equal(h.controller.snapshot().workspace, null);
  const reloaded = harness({marker: h.saved()}); await reloaded.controller.refresh(); await reloaded.controller.recover(true); await reloaded.controller.recover();
  assert.ok(reloaded.calls.some(c => c.input.action === 'read_operation')); assert.ok(!reloaded.calls.some(c => ['accept', 'abandon'].includes(c.input.action)));
});
test('same actor replacement cannot recover old session or keep old content', async () => {
  const h = harness(); await h.controller.refresh(); await h.controller.mutate(command()); h.identity({...identity, sessionId: randomUUID()}); await h.controller.recover();
  assert.equal(h.controller.snapshot().message, 'identity'); assert.equal(h.controller.snapshot().workspace, null); assert.equal(h.controller.canAbandon(), false); assert.ok(!h.calls.some(c => c.input.action === 'read_operation'));
});
test('TTL and revoked grant clear content and raw evidence while preserving unknown marker', async () => {
  const h = harness(); await h.controller.refresh(); await h.controller.mutate(command()); await h.controller.refresh();
  h.time(now + 30001); h.controller.expire(); assert.equal(h.controller.snapshot().workspace, null); assert.equal(h.controller.canAbandon(), false); assert.ok(h.controller.snapshot().pending);
  const revoked = harness(); await revoked.controller.refresh(); revoked.workspace(workspace({cases: [projection({grantState: 'revoked'})]})); await revoked.controller.refresh(); assert.equal(revoked.controller.snapshot().workspace, null);
});
test('late read after exit cannot restore sensitive content', async () => {
  const h = harness({send: async (input, bytes, id, controller) => { controller.invalidate(); return {ok: true, data: workspace()}; }});
  await h.controller.refresh(); assert.equal(h.controller.snapshot().workspace, null);
});
test('malformed or incomplete/staff Trip workspace fails closed', async () => {
  for (const w of [workspace({complete: false}), workspace({surface: 'owner'}), workspace({cases: [projection({trip: {kind: 'bound', tripId: randomUUID(), headVersion: 1}})]}), workspace({cases: [projection({sources: {kind: 'known', text: 'not granted'}})]})]) {
    const h = harness(); h.workspace(w); await h.controller.refresh(); assert.equal(h.controller.snapshot().workspace, null);
  }
});
test('capacity/shift/ownership gate controls; contact alone cannot resolve and staff cannot attach proposal', async () => {
  const c = projection(); assert.equal(canAct('accept', c, workspace(), now), true); assert.equal(canAct('accept', c, workspace({capacity: {...capacity, state: 'full'}}), now), false);
  const assigned = projection({status: 'assigned', staff: {actorId, label: 'Synthetic staff', acceptedAt: now, shiftEndsAt: now + 1000}});
  assert.equal(canAct('update', assigned, workspace(), now), true); assert.equal(canAct('update', assigned, workspace(), now + 1001), false);
  const h = harness(); h.workspace(workspace({cases: [assigned]})); await h.controller.refresh();
  const update = {...command(), action: 'update', status: 'resolved', evidence: [{kind: 'contacted_provider', note: 'Synthetic', reference: 'urn:synthetic', observedAt: now}], minutes: null, proposal: null};
  await h.controller.mutate(update); assert.equal(h.controller.snapshot().message, 'invalid');
  await h.controller.mutate({...update, status: 'unresolved', proposal: {proposalId: randomUUID(), tripId: randomUUID(), baseVersion: 1}}); assert.equal(h.calls.filter(c => c.input.action === 'update').length, 0);
});
test('storage failure never sends a mutation', async () => {
  const h = harness({storageFails: true}); await h.controller.refresh(); await h.controller.mutate(command()); assert.equal(h.controller.snapshot().message, 'storage'); assert.ok(!h.calls.some(c => c.input.action === 'accept'));
});
test('mismatched digest never clears original marker; exact receipt clears then reads fresh state', async () => {
  
  const h = harness({send: async (input, bytes) => input.action === 'workspace' ? {ok: true, data: workspace()} : {ok: true, data: {...receipt(input, bytes), requestDigest: 'a'.repeat(64)}}});
  await h.controller.refresh(); await h.controller.mutate(command()); assert.ok(h.controller.snapshot().pending);
  const good = harness({send: async (input, bytes) => input.action === 'workspace' ? {ok: true, data: workspace()} : {ok: true, data: receipt(input, bytes)}}); await good.controller.refresh(); await good.controller.mutate(command()); assert.equal(good.controller.snapshot().pending, null); assert.equal(good.controller.snapshot().message, 'confirmed');
});
test('metadata parser rejects injected body and receipt wrong case/actor-unrelated values', () => {
  assert.equal(decodeMarker({...harness().saved(), mutationBytes: 'secret'}), null);
  const p = {actorId, sessionId, operationId: randomUUID(), caseId, action: 'accept', expectedRevision: 1, grantRevision: 2, requestDigest: 'a'.repeat(64)};
  assert.deepEqual(decodeMarker(p), p); assert.equal(decodeMarker({...p, evidence: 'private'}), null);
  assert.equal(receiptMatches({...p, caseId: randomUUID()}, p), false);
});
test('controller through actual HTTP handler uses original cookie session headers and server requalification (synthetic RPC)', async () => {
  const calls = []; let stored = null;
  const c = new ServiceOpsController({identity: async () => identity, now: () => now, save() {}, changed() {}, async send(bytes, id) {
    const request = new Request('http://localhost/api/ops/service-cases/v1', {method: 'POST', headers: {'Content-Type': 'application/json', 'Origin': 'http://localhost', 'x-ops-expected-actor': id.actorId, 'x-ops-expected-session': id.sessionId}, body: bytes});
    const result = await handleServiceOperations(request, {enabled: true, surface: 'staff', sameOrigin: true, createRpc: () => ({authenticate: async () => actorId, sessionId: () => sessionId, call: async (name, params) => {
      calls.push(params.p_input.action);
      if (params.p_input.action === 'workspace') return {data: workspace(), error: null};
      if (params.p_input.action === 'read_operation') return {data: {receipt: stored}, error: null};
      stored = receipt(params.p_input, params.p_request_bytes); return {data: stored, error: null};
    }})});
    return {ok: result.status === 200, data: result.body.data};
  }}, null);
  await c.refresh(); await c.mutate(command()); assert.equal(c.snapshot().pending, null); assert.equal(c.snapshot().message, 'confirmed'); assert.equal(calls.filter(a => a === 'accept').length, 1); assert.ok(calls.includes('read_operation'));
});
test('freshness expires at request start plus 30 seconds; delayed reads cannot restart the clock', async () => {
  const h = harness(); h.workspace(workspace({cases: [projection({expiresAt: now + 300000})]})); await h.controller.refresh(); h.time(now + 30000); h.controller.expire(); assert.equal(h.controller.snapshot().workspace, null);
  let late;
  late = harness({send: async () => { late.time(now + 30001); return {ok: true, data: workspace({cases: [projection({expiresAt: now + 300000})]})}; }});
  await late.controller.refresh(); assert.equal(late.controller.snapshot().workspace, null);
});
test('accepted cases offer assign only, not a SQL-invalid update', () => {
  const c = projection({status: 'accepted', staff: {actorId, label: 'Synthetic', acceptedAt: now, shiftEndsAt: now + 60000}});
  assert.equal(canAct('assign', c, workspace(), now), true); assert.equal(canAct('update', c, workspace(), now), false);
});
test('server erased tombstone clears raw bytes but never claims cancellation or releases unknown marker', async () => {
  const h = harness({send: async input => input.action === 'workspace' ? {ok: true, data: workspace()} : {ok: false, code: 'CASE_OPERATION_ERASED', data: null}});
  await h.controller.refresh(); await h.controller.mutate(command()); assert.equal(h.controller.snapshot().message, 'erased'); assert.equal(h.controller.canAbandon(), false); assert.ok(h.controller.snapshot().pending);
});
test('corrupted storage remains blocked after refresh instead of silently enabling controls', async () => {
  const h = harness({blocked: true}); await h.controller.refresh(); assert.equal(h.controller.snapshot().message, 'storage'); await h.controller.mutate(command()); assert.ok(!h.calls.some(c => c.input.action === 'accept'));
});
