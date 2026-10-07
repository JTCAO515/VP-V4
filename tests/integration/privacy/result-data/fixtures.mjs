import { RESULT_SCHEMA, RESULT_BOUNDARIES, ERASED_KEYS, RETAINED_KEYS, REFERENCE_KEYS, resultDigest } from '../../../../lib/server/privacy/result-data/contract.ts';
import { emptyResultGraph, fenceCount } from '../../../../lib/server/privacy/result-data/protocol.ts';
export const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const now = 1791360000000;
export const actor = { ownerId: id(1), sessionId: id(2), mobileEpoch: 3 };
export const selection = { scope: 'result-sensitive-data/1', requestId: id(3), rootKind: 'artifact', rootId: id(4), objectIds: [] };
export const erase = { action: 'erase', ...selection, sourceDigest: 'a'.repeat(64), previewDigest: 'b'.repeat(64), confirmed: true };
export const eraseBytes = `  ${JSON.stringify(erase)}\n`;
export const previewCommand = { action: 'preview', ...selection };
export const recover = { action: 'recover', ...selection, mutationBytes: eraseBytes };
export const sourceAuthorities = [{ policyId: id(20), consentId: id(21) }, { policyId: id(22), consentId: id(23) }];
export const zero = keys => Object.fromEntries(keys.map(k => [k, 0]));
export const graph = { artifactIds: [id(4)], executionIds: [id(10)], journalIds: [id(11)], publicationKeys: [id(12), id(13)], revisions: [1, 2], eventIds: ['2', '10', '9223372036854775807'] };
export const references = { ...zero(REFERENCE_KEYS), conversationIds: [id(5)], goalIds: [id(6)], messageIds: [id(7)], taskIds: [id(8)], turnIds: [id(9)], threadIds: [], tripIds: [], memoryIds: [], sourceArtifactIds: [], proposalIds: [] };
export const eraseCounts = { ...zero(ERASED_KEYS), artifacts: 1, revisions: 2, resultEvents: 3, executionRuns: 1, callWindows: 1, collectorOrigins: 1, collectorOutputs: 1,
  resultClaims: 1, completionProofs: 1, completedReceipts: 1, localJournals: 1 };
export const retainCounts = { ...zero(RETAINED_KEYS), conversations: 1, goals: 1, messages: 1, tasks: 1, turns: 1, budgetAttempts: 1, planningSources: 3 };
export const binding = { schemaVersion: RESULT_SCHEMA, ...selection, ...actor, sourceDigest: erase.sourceDigest, previewDigest: erase.previewDigest, sourceAuthorities,
  capturedAt: now, expiresAt: now + 30000, boundaries: RESULT_BOUNDARIES[selection.scope], allUserDataCompleted: false };
export const preview = () => structuredClone({ ...binding, kind: 'preview', graph, eraseCounts, retainCounts, retainedReferences: references, conflicts: [], eligible: true, progressCount: 0 });
export const decision = () => structuredClone({ requestDigest: resultDigest(eraseBytes), decidedAt: now + 10, graph, erasedCounts: eraseCounts, retainedCounts: retainCounts,
  clearedPreviews: 0, retainedFences: fenceCount(graph), sourceResult: 'erased', sourceConversation: 'not_modified', sourceTrip: 'not_modified', explicitMemory: 'not_modified', externalCopies: 'not_erased' });
export const receipt = () => structuredClone({ ...binding, kind: 'receipt', state: 'erased', decision: decision() });
export const unknown = () => ({ schemaVersion: RESULT_SCHEMA, kind: 'unknown', ...selection, ...actor, requestDigest: resultDigest(eraseBytes), allUserDataCompleted: false });
export const operation = () => structuredClone({ ...selection, ...actor, sourceDigest: binding.sourceDigest, previewDigest: binding.previewDigest, sourceAuthorities,
  capturedAt: now, expiresAt: now + 30000, requestDigest: resultDigest(eraseBytes), state: 'erased', previewErased: true,
  graph: null, eraseCounts: null, retainCounts: null, retainedReferences: null, conflicts: null, decision: decision() });
export const listCommand = { action: 'list', scope: 'result-sensitive-data/1', rootKind: 'artifact', cursor: null, limit: 20 };
export const list = () => ({ schemaVersion: RESULT_SCHEMA, kind: 'list', ...actor, scope: listCommand.scope, rootKind: 'artifact', sourceDigest: 'c'.repeat(64),
  capturedAt: now, expiresAt: now + 30000, items: [{ rootKind: 'artifact', rootId: id(4), createdAt: now - 1000, currentRevision: 2, revisionCount: 2,
    eventCount: 3, lifecycle: 'withdrawn', resultTypes: ['comparison/1'] }], hasMore: false, nextCursor: null, allUserDataCompleted: false });
export const progressSelection = { scope: 'result-delete-progress/1', requestId: id(30), rootKind: null, rootId: null, objectIds: [id(3)] };
export const progressPreviewCommand = { action: 'preview', ...progressSelection };
export const progressErase = { action: 'erase', ...progressSelection, sourceDigest: 'd'.repeat(64), previewDigest: 'e'.repeat(64), confirmed: true };
export const progressEraseBytes = `\n${JSON.stringify(progressErase)}  `;
export const progressRecover = { action: 'recover', ...progressSelection, mutationBytes: progressEraseBytes };
export const progressBinding = { ...binding, ...progressSelection, sourceDigest: progressErase.sourceDigest, previewDigest: progressErase.previewDigest,
  capturedAt: now + 40000, expiresAt: now + 70000, boundaries: RESULT_BOUNDARIES[progressSelection.scope] };
export const progressPreview = () => structuredClone({ ...progressBinding, kind: 'preview', graph: emptyResultGraph(), eraseCounts: zero(ERASED_KEYS), retainCounts: zero(RETAINED_KEYS),
  retainedReferences: Object.fromEntries(REFERENCE_KEYS.map(k => [k, []])), conflicts: [], eligible: true, progressCount: 1 });
export const progressDecision = () => ({ ...decision(), requestDigest: resultDigest(progressEraseBytes), decidedAt: now + 40010, graph: emptyResultGraph(),
  erasedCounts: zero(ERASED_KEYS), retainedCounts: zero(RETAINED_KEYS), clearedPreviews: 1, retainedFences: 1, sourceResult: 'not_modified' });
export const progressReceipt = () => ({ ...progressBinding, kind: 'receipt', state: 'erased', decision: progressDecision() });
export const progressOperation = () => ({ ...operation(), ...progressSelection, sourceDigest: progressBinding.sourceDigest, previewDigest: progressBinding.previewDigest,
  capturedAt: progressBinding.capturedAt, expiresAt: progressBinding.expiresAt, requestDigest: resultDigest(progressEraseBytes), decision: progressDecision() });
export const progressListCommand = { action: 'list', scope: 'result-delete-progress/1', rootKind: null, cursor: null, limit: 20 };
export const progressList = () => ({ ...list(), scope: progressListCommand.scope, rootKind: null, capturedAt: now + 80000, expiresAt: now + 110000,
  items: [operation(), progressOperation()], sourceDigest: 'f'.repeat(64) });
