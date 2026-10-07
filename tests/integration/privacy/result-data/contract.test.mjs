import test from 'node:test';
import assert from 'node:assert/strict';
import { parseResultCommand, validGraph, resultDigest, CONFLICTS, validSourceAuthorities } from '../../../../lib/server/privacy/result-data/contract.ts';
import { decodeResultPreview, decodeResultReceipt, decodeResultList, validOperationRow } from '../../../../lib/server/privacy/result-data/protocol.ts';
import { handleResultData } from '../../../../lib/server/privacy/result-data/http.ts';
import { validResultCoverageSelection, resultCoverageRequestBody, resultCoverageOutcome } from '../../../../lib/server/privacy/result-data/coverage.ts';
import { collectResultInventory } from '../../../../lib/server/privacy/result-data/collector.ts';
import * as f from './fixtures.mjs';
import { handleCoverage } from '../../../../lib/server/privacy/coverage/http.ts';
import { CATALOG_VERSION, MODULE_CATALOG } from '../../../../lib/server/privacy/coverage/catalog.ts';
import { parseCoverageInput } from '../../../../lib/server/privacy/coverage/contract.ts';
import { matchesCoverageResult } from '../../../../lib/server/privacy/coverage/consumer.ts';
import { OWNER_HANDLERS } from '../../../../lib/server/privacy/coverage/registry.ts';
const request = v => new Request('http://localhost/api/privacy/native/v1/result-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof v === 'string' ? v : JSON.stringify(v) });
const options = rpc => ({ enabled: true, now: () => f.now + 20, authority: () => ({ authenticate: async () => f.actor, current: async () => true, rpc }) });

test('one artifact only, exact all-revision closure, canonical bigint events, original-byte recovery', () => {
  assert.ok(parseResultCommand(f.erase)); assert.equal(parseResultCommand(f.recover).mutationBytes, f.eraseBytes);
  for (const change of [{ rootKind: 'thread' }, { rootKind: 'conversation' }, { revision: 2 }, { objectIds: [f.id(4)] }, { actorId: f.id(1) },
    { sourceAuthorities: f.sourceAuthorities }, { confirmed: false }, { action: ['erase'] }]) assert.equal(parseResultCommand({ ...f.erase, ...change }), null);
  assert.equal(parseResultCommand({ ...f.recover, rootId: f.id(99) }), null);
  assert.equal(parseResultCommand({ ...f.recover, mutationBytes: JSON.stringify(f.recover) }), null);
  assert.ok(validGraph(f.graph));
  for (const change of [{ eventIds: ['10', '2'] }, { eventIds: [2, 10] }, { eventIds: ['9223372036854775808'] }, { revisions: [1, 1] }, { executionIds: [f.id(10), f.id(10)] }])
    assert.equal(validGraph({ ...f.graph, ...change }), false);
  assert.equal(decodeResultPreview({ ...f.preview(), graph: { ...f.graph, revisions: [2] }, eraseCounts: { ...f.eraseCounts, revisions: 1 } }, f.previewCommand, f.actor, f.now + 1), null);
});

test('preview binds source, full closure/counts, original authorities and retained provenance with explicit blockers', () => {
  assert.ok(decodeResultPreview(f.preview(), f.previewCommand, f.actor, f.now + 1));
  for (const conflict of CONFLICTS) assert.ok(decodeResultPreview({ ...f.preview(), conflicts: [conflict], eligible: false }, f.previewCommand, f.actor, f.now + 1));
  for (const change of [{ ownerId: f.id(99) }, { mobileEpoch: 4 }, { expiresAt: f.now + 60000 }, { sourceAuthorities: [] }, { allUserDataCompleted: true },
    { graph: { ...f.graph, artifactIds: [f.id(99)] } }, { eraseCounts: { ...f.eraseCounts, resultEvents: 2 } }, { retainCounts: { ...f.retainCounts, tasks: 0 } },
    { conflicts: ['CORE_EXPORT_COPY', 'ACTIVE_WORK'], eligible: false }, { conflicts: ['UNKNOWN'], eligible: false }, { boundaries: { ...f.binding.boundaries, missing: [] } }])
    assert.equal(decodeResultPreview({ ...f.preview(), ...change }, f.previewCommand, f.actor, f.now + 1), null);
  assert.equal(decodeResultPreview(f.preview(), f.previewCommand, f.actor, f.now + 30000), null);
  assert.equal(validSourceAuthorities([...f.sourceAuthorities].reverse()), false);
});

test('immutable receipt survives TTL with exact bytes, fences and preserved Conversation/Trip/Memory authority', () => {
  assert.ok(decodeResultReceipt(f.receipt(), f.erase, f.actor, resultDigest(f.eraseBytes), f.now + 40000));
  for (const change of [{ sourceConversation: 'erased' }, { sourceTrip: 'erased' }, { explicitMemory: 'erased' }, { decidedAt: f.now + 30000 },
    { retainedFences: 1 }, { requestDigest: resultDigest(JSON.stringify(f.erase)) }, { erasedCounts: { ...f.eraseCounts, revisions: 1 } }])
    assert.equal(decodeResultReceipt({ ...f.receipt(), decision: { ...f.decision(), ...change } }, f.erase, f.actor, resultDigest(f.eraseBytes), f.now + 40000), null);
  assert.equal(decodeResultReceipt({ ...f.receipt(), sourceDigest: 'c'.repeat(64) }, f.erase, f.actor, resultDigest(f.eraseBytes), f.now + 40000), null);
});

test('complete finite operation inventory includes cleaned fences and its own progress operation; progress never erases source', () => {
  assert.ok(validOperationRow(f.operation(), f.actor.ownerId, f.now + 80001));
  assert.ok(validOperationRow(f.progressOperation(), f.actor.ownerId, f.now + 80001));
  assert.ok(decodeResultList(f.progressList(), f.progressListCommand, f.actor, f.now + 80001));
  assert.ok(decodeResultPreview(f.progressPreview(), f.progressPreviewCommand, f.actor, f.now + 40001));
  assert.ok(decodeResultReceipt(f.progressReceipt(), f.progressErase, f.actor, resultDigest(f.progressEraseBytes), f.now + 80001));
  for (const change of [{ rawBytes: f.eraseBytes }, { previewErased: false }, { sourceAuthorities: [] }, { decision: { ...f.decision(), receipt: f.receipt() } }])
    assert.equal(validOperationRow({ ...f.operation(), ...change }, f.actor.ownerId, f.now + 80001), false);
  assert.equal(parseResultCommand({ ...f.progressPreviewCommand, objectIds: [f.progressSelection.requestId] }), null);
  assert.equal(decodeResultReceipt({ ...f.progressReceipt(), decision: { ...f.progressDecision(), sourceResult: 'erased' } }, f.progressErase, f.actor, resultDigest(f.progressEraseBytes), f.now + 80001), null);
});

test('HTTP authority precedes dispatch, original bytes are preserved, every uncertain mutation ACK remains unknown', async () => {
  let calls = 0;
  const good = await handleResultData(request(f.eraseBytes), options(async (action, bytes) => { calls++; assert.equal(action, 'erase'); assert.equal(bytes, f.eraseBytes); return f.receipt(); }));
  assert.equal(good.status, 200); assert.equal(calls, 1); assert.equal(good.headers.get('Cache-Control'), 'private, no-store');
  for (const rpc of [async () => { throw Error('network'); }, async () => ({ ...f.receipt(), decision: { ...f.decision(), sourceConversation: 'erased' } })]) {
    const response = await handleResultData(request(f.eraseBytes), options(rpc)); assert.equal((await response.json()).error.code, 'RESULT_ACK_UNKNOWN');
  }
  const recovery = await handleResultData(request(f.recover), options(async (action, bytes) => { assert.equal(action, 'recover'); assert.equal(JSON.parse(bytes).mutationBytes, f.eraseBytes); return f.unknown(); }));
  assert.equal(recovery.status, 200); assert.equal((await recovery.json()).data.kind, 'unknown');
  const original = request(f.previewCommand); original.headers.set('cookie', 'untrusted=1');
  assert.equal((await handleResultData(original, options(async () => { calls++; }))).status, 400);
  const denied = { enabled: true, authority: () => ({ authenticate: async () => null, current: async () => true, rpc: async () => { calls++; } }) };
  assert.equal((await handleResultData(request(f.eraseBytes), denied)).status, 401); assert.equal(calls, 1);
  let current = true;
  const replaced = { enabled: true, now: () => f.now + 20, authority: () => ({ authenticate: async () => f.actor, current: async () => current, rpc: async () => { current = false; return f.receipt(); } }) };
  assert.equal((await (await handleResultData(request(f.eraseBytes), replaced)).json()).error.code, 'RESULT_ACK_UNKNOWN');
});

test('actual list includes withdrawn artifacts with complete revisions and forbids sensitive title/body or truncated closure', () => {
  assert.ok(decodeResultList(f.list(), f.listCommand, f.actor, f.now + 1));
  assert.ok(decodeResultList(f.proposalList(), f.listCommand, f.actor, f.now + 1));
  assert.equal(decodeResultList({ ...f.proposalList(), items: [{ ...f.proposalList().items[0], resultTypes: ['change-proposal/1'] }] }, f.listCommand, f.actor, f.now + 1), null);
  for (const change of [{ title: 'sensitive' }, { revisionCount: 1 }, { eventCount: 0 }, { resultTypes: ['unregistered/1'] }])
    assert.equal(decodeResultList({ ...f.list(), items: [{ ...f.list().items[0], ...change }] }, f.listCommand, f.actor, f.now + 1), null);
  assert.equal(decodeResultList({ ...f.list(), items: [...f.list().items, ...f.list().items] }, f.listCommand, f.actor, f.now + 1), null);
});

test('inventory collector binds one snapshot/deadline and returns no partial list after source or session change', async () => {
  const signal = new AbortController().signal;
  assert.equal((await collectResultInventory(f.listCommand.scope, f.actor, async () => f.list(), async () => true, signal, () => f.now + 1)).length, 1);
  const rows = Array.from({ length: 20 }, (_, i) => ({ ...f.list().items[0], rootId: f.id(100 + i) }));
  const first = { ...f.list(), items: rows, hasMore: true, nextCursor: { sourceDigest: f.list().sourceDigest, afterId: f.id(119) } };
  let calls = 0;
  await assert.rejects(collectResultInventory(f.listCommand.scope, f.actor, async () => ++calls === 1 ? first : { ...f.list(), sourceDigest: 'f'.repeat(64), items: [] }, async () => true, signal, () => f.now + 1), /RESULT_SOURCE_UNAVAILABLE/);
  let current = true;
  await assert.rejects(collectResultInventory(f.listCommand.scope, f.actor, async () => { current = false; return first; }, async () => current, signal, () => f.now + 1), /RESULT_SOURCE_UNAVAILABLE/);
});

test('coverage only selects results/delete and retains exact bytes for recovery', () => {
  const input = { actorId: f.actor.ownerId, sessionId: f.actor.sessionId, mobileEpoch: f.actor.mobileEpoch, moduleId: 'results', moduleVersion: 'result-data/1',
    operationId: f.selection.requestId, action: 'delete', phase: 'execute', tripId: null, commandBytes: f.eraseBytes };
  assert.ok(validResultCoverageSelection(input, f.erase));
  assert.equal(resultCoverageOutcome({ input, command: f.erase }, f.receipt(), f.now + 20).state, 'scoped_complete');
  for (const change of [{ moduleId: 'conversations' }, { moduleId: 'turn' }, { action: 'export' }, { tripId: f.id(99) }]) assert.equal(validResultCoverageSelection({ ...input, ...change }, f.erase), false);
  assert.equal(JSON.parse(resultCoverageRequestBody({ ...input, phase: 'recover' })).mutationBytes, f.eraseBytes);
  assert.equal(resultCoverageOutcome({ input: { ...input, phase: 'recover' }, command: f.erase }, f.unknown(), f.now + 20).state, 'unknown');
});


test('leased caller dispatches actual result preview/erase/recover path and preserves original core export/other33', async () => {
  const fresh = Date.now(), authorityActor = { actorId: f.actor.ownerId, sessionId: f.actor.sessionId, mobileEpoch: f.actor.mobileEpoch };
  const input = { schemaVersion: 'data-coverage/1', catalogVersion: CATALOG_VERSION, ...authorityActor, moduleId: 'results', moduleVersion: 'result-data/1',
    operationId: f.selection.requestId, action: 'delete', phase: 'execute', confirmed: true, tripId: null, commandBytes: f.eraseBytes };
  assert.equal(parseCoverageInput(input).handler, 'result_data'); assert.equal(typeof OWNER_HANDLERS.result_data, 'function');
  const core = { ...input, action: 'export', commandBytes: JSON.stringify({ requestId: f.selection.requestId, confirmed: true }) };
  assert.equal(parseCoverageInput(core).handler, 'core');
  let loseAck = false, calls = 0;
  const stamp = { capturedAt: fresh - 5, expiresAt: fresh - 5 + 30000 };
  const terminal = { ...f.receipt(), ...stamp, decision: { ...f.decision(), decidedAt: fresh - 3 } };
  const options = { enabled: true, authority: () => ({ authenticate: async () => authorityActor, current: async () => true }), handlers: {
    result_data: async original => {
      assert.equal(new URL(original.url).pathname, '/api/privacy/native/v1/result-data'); calls++;
      return handleResultData(original, { enabled: true, now: () => fresh, authority: () => ({ authenticate: async () => f.actor, current: async () => true,
        rpc: async (action, raw) => {
          if (action === 'preview') return { ...f.preview(), ...stamp };
          if (action === 'recover') { assert.equal(JSON.parse(raw).mutationBytes, f.eraseBytes); return f.unknown(); }
          assert.equal(raw, f.eraseBytes); if (loseAck) throw Error('synthetic lost ACK'); return terminal;
        } }) });
    },
  } };
  const call = async value => {
    const raw = JSON.stringify(value), response = await handleCoverage(new Request('http://localhost/api/privacy/native/v1/coverage', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: raw }), options);
    assert.equal(response.status, 200); return { raw, result: await response.json() };
  };
  const catalog = await (await handleCoverage(new Request('http://localhost/api/privacy/native/v1/coverage'), options)).json();
  assert.equal(catalog.catalogVersion, CATALOG_VERSION); assert.equal(catalog.modules.length, 34); assert.deepEqual(catalog.modules, MODULE_CATALOG);
  const p = await call({ ...input, phase: 'preview', commandBytes: JSON.stringify(f.previewCommand) });
  assert.equal(p.result.state, 'preview'); assert.ok(matchesCoverageResult(p.result, p.raw, fresh));
  const r = await call(input); assert.equal(r.result.state, 'scoped_complete'); assert.ok(matchesCoverageResult(r.result, r.raw, fresh)); assert.equal(r.result.allUserDataCompleted, false);
  loseAck = true; const lost = await call(input); assert.equal(lost.result.state, 'unknown');
  const recovered = await call({ ...input, phase: 'recover' }); assert.equal(recovered.result.state, 'unknown'); assert.ok(matchesCoverageResult(recovered.result, recovered.raw, fresh));
  assert.equal(calls, 4);
  const stale = await handleCoverage(new Request('http://localhost/api/privacy/native/v1/coverage', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...input, catalogVersion: 'data-coverage-catalog/2026-10-06.7' }) }), options);
  assert.equal(stale.status, 400); assert.equal(calls, 4);
});
