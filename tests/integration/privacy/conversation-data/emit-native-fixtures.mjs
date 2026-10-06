/** Synthetic sole-TS decoder fixtures; not SQL/Auth/provider/device erasure evidence. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { CONVERSATION_SCHEMA, CONVERSATION_BOUNDARIES, GRAPH_KEYS, ERASED_KEYS, REDACTED_KEYS, RETAINED_KEYS,
  conversationDigest, parseConversationCommand } from '../../../../lib/server/privacy/conversation-data/contract.ts';
import { decodeConversationList, decodeConversationPreview, decodeConversationReceipt, decodeConversationUnknown, validOperationRow } from '../../../../lib/server/privacy/conversation-data/protocol.ts';

const output = resolve(process.argv[2] ?? 'tests/fixtures/privacy/conversation-data');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = 1791246000000, actor = { ownerId: id(1), sessionId: id(2), mobileEpoch: 3 };
const zero = keys => Object.fromEntries(keys.map(k => [k, 0]));
const emptyGraph = () => Object.fromEntries(GRAPH_KEYS.map(k => [k, []]));
const selection = { scope: 'conversation-sensitive-data/1', requestId: id(3), rootKind: 'conversation', rootId: id(4), objectIds: [] };
const command = { action: 'erase', ...selection, sourceDigest: 'a'.repeat(64), previewDigest: 'b'.repeat(64), confirmed: true };
const bytes = `  ${JSON.stringify(command)}\n`;
const binding = { schemaVersion: CONVERSATION_SCHEMA, ...selection, ...actor, sourceDigest: command.sourceDigest, previewDigest: command.previewDigest,
  capturedAt: now, expiresAt: now + 30000, boundaries: CONVERSATION_BOUNDARIES[selection.scope], allUserDataCompleted: false };
const graph = { ...emptyGraph(), conversationIds: [id(4)], goalIds: [id(5)], messageIds: [id(6)], taskIds: [id(7)], threadIds: [id(8)], turnIds: [id(9)], artifactIds: [id(10)] };
const eraseCounts = { ...zero(ERASED_KEYS), conversations: 1, goals: 1, messages: 1, threads: 1, turns: 1, artifacts: 1 };
const redactCounts = { textBodies: 1, taskDigests: 1 }, retainCounts = { ...zero(RETAINED_KEYS), tasks: 1, taskTurns: 1, capacity: 1 };
const preview = { ...binding, kind: 'preview', graph, eraseCounts, redactCounts, retainCounts,
  retainedReferences: { tripIds: [id(11)], memoryIds: [id(12)] }, conflicts: [], eligible: true, progressCount: 0 };
const decision = { requestDigest: conversationDigest(bytes), decidedAt: now + 10, graph, erasedCounts: eraseCounts, redactedCounts: redactCounts,
  retainedCounts: retainCounts, clearedPreviews: 0, retainedFences: 7, sourceConversation: 'erased', sourceTrip: 'not_modified', explicitMemory: 'not_modified', externalCopies: 'not_erased' };
const receipt = { ...binding, kind: 'receipt', state: 'erased', decision };
const unknown = { schemaVersion: CONVERSATION_SCHEMA, kind: 'unknown', ...selection, ...actor, requestDigest: conversationDigest(bytes), allUserDataCompleted: false };
const blocked = { ...preview, eligible: false, conflicts: ['ACTIVE_WORK', 'BRIEF_REFERENCE'] };
const list = (scope, rootKind, items) => ({ schemaVersion: CONVERSATION_SCHEMA, kind: 'list', scope, rootKind, ...actor,
  sourceDigest: binding.sourceDigest, capturedAt: now, expiresAt: now + 30000, items, hasMore: false, nextCursor: null, allUserDataCompleted: false });
const conversationList = list(selection.scope, 'conversation', [{ rootKind: 'conversation', rootId: id(4), createdAt: now - 1000 }]);
const threadList = list(selection.scope, 'thread', [{ rootKind: 'thread', rootId: id(15), createdAt: now - 1000 }]);
const operation = { ...selection, ...actor, sourceDigest: binding.sourceDigest, previewDigest: binding.previewDigest, capturedAt: now, expiresAt: now + 30000,
  requestDigest: conversationDigest(bytes), state: 'erased', previewErased: true, graph: null, eraseCounts: null, redactCounts: null, retainCounts: null,
  retainedReferences: null, conflicts: null, decision };
const progressSelection = { scope: 'conversation-delete-progress/1', requestId: id(13), rootKind: null, rootId: null, objectIds: [selection.requestId] };
const progressCommand = { action: 'erase', ...progressSelection, sourceDigest: 'c'.repeat(64), previewDigest: 'd'.repeat(64), confirmed: true };
const progressBytes = `\n${JSON.stringify(progressCommand)}  `;
const progressBinding = { ...binding, ...progressSelection, sourceDigest: progressCommand.sourceDigest, previewDigest: progressCommand.previewDigest,
  boundaries: CONVERSATION_BOUNDARIES[progressSelection.scope] };
const progressPreview = { ...progressBinding, kind: 'preview', graph: emptyGraph(), eraseCounts: zero(ERASED_KEYS), redactCounts: zero(REDACTED_KEYS),
  retainCounts: zero(RETAINED_KEYS), retainedReferences: { tripIds: [], memoryIds: [] }, conflicts: [], eligible: true, progressCount: 1 };
const progressDecision = { ...decision, requestDigest: conversationDigest(progressBytes), graph: emptyGraph(), erasedCounts: zero(ERASED_KEYS),
  redactedCounts: zero(REDACTED_KEYS), retainedCounts: zero(RETAINED_KEYS), clearedPreviews: 1, retainedFences: 1, sourceConversation: 'not_modified' };
const progressReceipt = { ...progressBinding, kind: 'receipt', state: 'erased', decision: progressDecision };
const progressList = list(progressSelection.scope, null, [operation]);
const listCommand = (scope, rootKind) => ({ action: 'list', scope, rootKind, cursor: null, limit: 20 });
assert.ok(parseConversationCommand(JSON.parse(bytes)));
assert.ok(decodeConversationList(conversationList, listCommand(selection.scope, 'conversation'), actor, now + 20));
assert.ok(decodeConversationList(threadList, listCommand(selection.scope, 'thread'), actor, now + 20));
assert.ok(decodeConversationPreview(preview, { action: 'preview', ...selection }, actor, now + 20));
assert.ok(decodeConversationPreview(blocked, { action: 'preview', ...selection }, actor, now + 20));
assert.ok(decodeConversationReceipt(receipt, command, actor, conversationDigest(bytes), now + 40000));
assert.ok(decodeConversationUnknown(unknown, command, actor, conversationDigest(bytes)));
assert.ok(validOperationRow(operation, actor.ownerId, now + 40000));
assert.ok(decodeConversationList(progressList, listCommand(progressSelection.scope, null), actor, now + 20));
assert.ok(decodeConversationPreview(progressPreview, { action: 'preview', ...progressSelection }, actor, now + 20));
assert.ok(decodeConversationReceipt(progressReceipt, progressCommand, actor, conversationDigest(progressBytes), now + 40000));
mkdirSync(output, { recursive: true });
for (const [name, data] of Object.entries({ 'conversation-list': conversationList, 'thread-list': threadList, 'conversation-preview': preview,
  'conversation-blocked': blocked, 'conversation-receipt': receipt, 'conversation-unknown': unknown, 'progress-list': progressList,
  'progress-preview': progressPreview, 'progress-receipt': progressReceipt })) writeFileSync(join(output, name + '.json'), JSON.stringify({ data }, null, 2) + '\n');
writeFileSync(join(output, 'commands.json'), JSON.stringify({ syntheticSource: true, schemaVersion: CONVERSATION_SCHEMA, actor, now: now + 20,
  receiptRecoveryNow: now + 40000, eraseBytes: bytes, progressEraseBytes: progressBytes,
  preview: { action: 'preview', ...selection }, progressPreview: { action: 'preview', ...progressSelection } }, null, 2) + '\n');
console.log('Synthetic sole-TS Native fixtures written: ' + output);
