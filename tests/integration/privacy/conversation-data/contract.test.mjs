import test from 'node:test';
import assert from 'node:assert/strict';
import { CONVERSATION_SCHEMA, CONVERSATION_BOUNDARIES, GRAPH_KEYS, ERASED_KEYS, REDACTED_KEYS, RETAINED_KEYS,
  parseConversationCommand, conversationDigest } from '../../../../lib/server/privacy/conversation-data/contract.ts';
import { decodeConversationPreview, decodeConversationReceipt, decodeConversationList, validOperationRow } from '../../../../lib/server/privacy/conversation-data/protocol.ts';
import { handleConversationData } from '../../../../lib/server/privacy/conversation-data/http.ts';
import { conversationCoverageOutcome, conversationCoverageRequestBody, validConversationCoverageSelection } from '../../../../lib/server/privacy/conversation-data/coverage.ts';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = 1791246000000;
const actor = { ownerId: id(1), sessionId: id(2), mobileEpoch: 3 };
const selection = { scope: 'conversation-sensitive-data/1', requestId: id(3), rootKind: 'conversation', rootId: id(4), objectIds: [] };
const command = { action: 'erase', ...selection, sourceDigest: 'a'.repeat(64), previewDigest: 'b'.repeat(64), confirmed: true };
const bytes = `  ${JSON.stringify(command)}\n`;
const binding = { schemaVersion: CONVERSATION_SCHEMA, ...selection, ...actor, sourceDigest: command.sourceDigest, previewDigest: command.previewDigest,
  capturedAt: now, expiresAt: now + 30000, boundaries: CONVERSATION_BOUNDARIES[selection.scope], allUserDataCompleted: false };
const zero = keys => Object.fromEntries(keys.map(k => [k, 0]));
const graph = { ...Object.fromEntries(GRAPH_KEYS.map(k => [k, []])), conversationIds: [selection.rootId], goalIds: [id(5)], messageIds: [id(6)], taskIds: [id(7)], threadIds: [id(8)], turnIds: [id(9)], artifactIds: [id(10)] };
const eraseCounts = { ...zero(ERASED_KEYS), conversations: 1, goals: 1, messages: 1, threads: 1, turns: 1, artifacts: 1 };
const redactCounts = { textBodies: 1, taskDigests: 1 };
const retainCounts = { ...zero(RETAINED_KEYS), tasks: 1, taskTurns: 1, capacity: 1 };
const preview = () => structuredClone({ ...binding, kind: 'preview', graph, eraseCounts, redactCounts, retainCounts,
  retainedReferences: { tripIds: [id(11)], memoryIds: [id(12)] }, conflicts: [], eligible: true, progressCount: 0 });
const decision = () => structuredClone({ requestDigest: conversationDigest(bytes), decidedAt: now + 10, graph, erasedCounts: eraseCounts, redactedCounts: redactCounts,
  retainedCounts: retainCounts, clearedPreviews: 0, retainedFences: 7, sourceConversation: 'erased', sourceTrip: 'not_modified', explicitMemory: 'not_modified', externalCopies: 'not_erased' });
const receipt = () => ({ ...binding, kind: 'receipt', state: 'erased', decision: decision() });
const recover = () => ({ action: 'recover', ...selection, mutationBytes: bytes });
const request = v => new Request('http://localhost/api/privacy/native/v1/conversation-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof v === 'string' ? v : JSON.stringify(v) });
const options = rpc => ({ enabled: true, now: () => now + 20, authority: () => ({ authenticate: async () => actor, current: async () => true, rpc }) });

test('closed commands bind exact root and byte-preserving recovery, rejecting coerced actions/authority', () => {
  assert.deepEqual(parseConversationCommand(command), command);
  assert.equal(parseConversationCommand(recover()).mutationBytes, bytes);
  for (const change of [{ action: ['erase'] }, { rootKind: ['conversation'] }, { ownerId: actor.ownerId }, { confirmed: false },
    { objectIds: [id(99)] }, { rootId: selection.rootId.toUpperCase().replace('00000000', 'AAAAAAAA') }, { sourceDigest: null }])
    assert.equal(parseConversationCommand({ ...command, ...change }), null);
  assert.equal(parseConversationCommand({ ...recover(), rootId: id(99) }), null);
  assert.equal(parseConversationCommand({ ...recover(), mutationBytes: JSON.stringify(recover()) }), null);
});

test('preview lists qualified exact graph, deletion/redaction/retention and honest domain blockers', () => {
  const c = { action: 'preview', ...selection };
  assert.ok(decodeConversationPreview(preview(), c, actor, now + 1));
  const blocked = { ...preview(), conflicts: ['ACTIVE_WORK', 'PROPOSAL_REFERENCE'], eligible: false };
  assert.ok(decodeConversationPreview(blocked, c, actor, now + 1));
  for (const change of [{ ownerId: id(90) }, { mobileEpoch: 4 }, { expiresAt: now + 60000 }, { allUserDataCompleted: true },
    { conflicts: ['PROPOSAL_REFERENCE', 'ACTIVE_WORK'], eligible: false }, { conflicts: ['UNKNOWN_DOMAIN'], eligible: false },
    { graph: { ...graph, conversationIds: [id(90)] } }, { eraseCounts: { ...eraseCounts, artifacts: 0 } },
    { eraseCounts: { ...eraseCounts, revisions: 4100 } }, { boundaries: { ...binding.boundaries, retained: [] } }])
    assert.equal(decodeConversationPreview({ ...preview(), ...change }, c, actor, now + 1), null);
  assert.equal(decodeConversationPreview(preview(), c, actor, now + 30000), null);
});

test('immutable receipt recovery accepts original decision past TTL, never new digest/time/Trip/Memory effects', () => {
  assert.ok(decodeConversationReceipt(receipt(), command, actor, conversationDigest(bytes), now + 30001));
  for (const change of [{ sourceTrip: 'erased' }, { explicitMemory: 'erased' }, { decidedAt: now + 30000 }, { retainedFences: 0 },
    { requestDigest: conversationDigest(JSON.stringify(command)) }, { erasedCounts: { ...eraseCounts, turns: 0 } },
    { redactedCounts: { ...redactCounts, taskDigests: 0 } }, { graph: { ...graph, conversationIds: [id(90)] } }])
    assert.equal(decodeConversationReceipt({ ...receipt(), decision: { ...decision(), ...change } }, command, actor, conversationDigest(bytes), now + 30001), null);
  assert.equal(decodeConversationReceipt({ ...receipt(), sourceDigest: 'c'.repeat(64) }, command, actor, conversationDigest(bytes), now + 30), null);
});

test('all retained operation fields are discoverable, finite and sanitized; progress never claims source deletion', () => {
  const op = { ...selection, ...actor, sourceDigest: binding.sourceDigest, previewDigest: binding.previewDigest, capturedAt: now, expiresAt: now + 30000,
    requestDigest: conversationDigest(bytes), state: 'erased', previewErased: true, graph: null, eraseCounts: null, redactCounts: null, retainCounts: null, retainedReferences: null, conflicts: null, decision: decision() };
  assert.ok(validOperationRow(op, actor.ownerId, now + 40000));
  for (const change of [{ rawBytes: bytes }, { sourceBody: 'secret' }, { previewErased: false }, { decision: { ...decision(), receipt: receipt() } }])
    assert.equal(validOperationRow({ ...op, ...change }, actor.ownerId, now + 40000), false);
  const listCommand = { action: 'list', scope: 'conversation-delete-progress/1', rootKind: null, cursor: null, limit: 20 };
  const list = { schemaVersion: CONVERSATION_SCHEMA, kind: 'list', ...actor, scope: listCommand.scope, rootKind: null,
    sourceDigest: 'a'.repeat(64), capturedAt: now + 40000, expiresAt: now + 70000, items: [op], hasMore: false, nextCursor: null, allUserDataCompleted: false };
  assert.ok(decodeConversationList(list, listCommand, actor, now + 40001));
  assert.equal(decodeConversationList({ ...list, items: [op, op] }, listCommand, actor, now + 40001), null);
  const s = { scope: 'conversation-delete-progress/1', requestId: id(13), rootKind: null, rootId: null, objectIds: [op.requestId] };
  const erase = { action: 'erase', ...s, sourceDigest: command.sourceDigest, previewDigest: command.previewDigest, confirmed: true };
  const d = { ...decision(), requestDigest: conversationDigest(JSON.stringify(erase)), graph: Object.fromEntries(GRAPH_KEYS.map(k => [k, []])), erasedCounts: zero(ERASED_KEYS),
    redactedCounts: zero(REDACTED_KEYS), retainedCounts: zero(RETAINED_KEYS), clearedPreviews: 1, retainedFences: 1, sourceConversation: 'not_modified' };
  const r = { ...receipt(), ...s, boundaries: CONVERSATION_BOUNDARIES[s.scope], decision: d };
  assert.ok(decodeConversationReceipt(r, erase, actor, d.requestDigest, now + 20));
  assert.equal(decodeConversationReceipt({ ...r, decision: { ...d, sourceConversation: 'erased' } }, erase, actor, d.requestDigest, now + 20), null);
});

test('HTTP preserves original dispatch bytes and unknown ACK; recover cannot accept a mismatched stored source', async () => {
  let calls = 0;
  const good = await handleConversationData(request(bytes), options(async (action, raw) => { calls++; assert.equal(action, 'erase'); assert.equal(raw, bytes); return receipt(); }));
  assert.equal(good.status, 200); assert.equal(good.headers.get('Cache-Control'), 'private, no-store'); assert.equal(calls, 1);
  for (const rpc of [async () => { throw Error('network'); }, async () => ({ ...receipt(), decision: { ...decision(), sourceTrip: 'erased' } })]) {
    const response = await handleConversationData(request(bytes), options(rpc));
    assert.equal(response.status, 503); assert.equal((await response.json()).error.code, 'CONVERSATION_ACK_UNKNOWN');
  }
  const response = await handleConversationData(request(recover()), options(async (action, raw) => {
    assert.equal(action, 'recover'); assert.equal(JSON.parse(raw).mutationBytes, bytes); return { ...receipt(), sourceDigest: 'c'.repeat(64) };
  }));
  assert.equal((await response.json()).error.code, 'CONVERSATION_ACK_UNKNOWN');
});

test('authority precedes source dispatch; replaced session and forbidden transport cannot leak graph', async () => {
  let calls = 0;
  const rpc = async () => { calls++; return preview(); };
  const unavailable = { enabled: true, authority: () => ({ authenticate: async () => null, current: async () => true, rpc }) };
  assert.equal((await handleConversationData(request({ action: 'preview', ...selection }), unavailable)).status, 401);
  const replaced = { enabled: true, authority: () => ({ authenticate: async () => actor, current: async () => false, rpc }) };
  assert.equal((await handleConversationData(request(command), replaced)).status, 401);
  const original = request(command); original.headers.set('cookie', 'untrusted=1');
  assert.equal((await handleConversationData(original, options(rpc))).status, 400);
  assert.equal(calls, 0);
  let current = true;
  const expired = { enabled: true, now: () => now + 1, authority: () => ({ authenticate: async () => actor, current: async () => current, rpc: async () => { current = false; return receipt(); } }) };
  assert.equal((await (await handleConversationData(request(bytes), expired)).json()).error.code, 'CONVERSATION_ACK_UNKNOWN');
});

test('coverage is scoped to conversations, preserves original core export and reports unknown ACK accurately', () => {
  const input = { actorId: actor.ownerId, sessionId: actor.sessionId, mobileEpoch: actor.mobileEpoch, moduleId: 'conversations', moduleVersion: CONVERSATION_SCHEMA,
    operationId: selection.requestId, action: 'delete', phase: 'execute', tripId: null, commandBytes: bytes };
  assert.ok(validConversationCoverageSelection(input, command));
  assert.deepEqual(conversationCoverageOutcome({ input, command, handler: 'conversation_data' }, receipt(), now + 20),
    { state: 'scoped_complete', reason: 'SELECTED_CONVERSATION_ERASURE_WITH_DECLARED_RETENTION' });
  for (const change of [{ moduleId: 'results' }, { moduleId: 'turn' }, { action: 'export' }, { tripId: id(11) }])
    assert.equal(validConversationCoverageSelection({ ...input, ...change }, command), false);
  const recoverInput = { ...input, phase: 'recover' };
  assert.equal(JSON.parse(conversationCoverageRequestBody(recoverInput)).mutationBytes, bytes);
  const unknown = { schemaVersion: CONVERSATION_SCHEMA, kind: 'unknown', ...selection, ...actor, requestDigest: conversationDigest(bytes), allUserDataCompleted: false };
  assert.deepEqual(conversationCoverageOutcome({ input: recoverInput, command, handler: 'conversation_data' }, unknown, now + 20),
    { state: 'unknown', reason: 'CONVERSATION_ACK_UNKNOWN' });
});
