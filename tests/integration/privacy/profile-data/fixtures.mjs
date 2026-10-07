import { PROFILE_SCHEMA, PROFILE_BOUNDARIES, PROFILE_FIELDS, COPY_KEYS, profileDigest } from '../../../../lib/server/privacy/profile-data/contract.ts';
export const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const now = 1791369600000;
export const actor = { ownerId: id(1), sessionId: id(2), mobileEpoch: 3 };
export const selection = { scope: 'profile-sensitive-data/1', requestId: id(3), profileId: actor.ownerId, objectIds: [] };
export const command = { action: 'erase', ...selection, sourceDigest: 'a'.repeat(64), previewDigest: 'b'.repeat(64), confirmed: true };
export const bytes = `  ${JSON.stringify(command)}\n`;
export const binding = { schemaVersion: PROFILE_SCHEMA, ...selection, ...actor, sourceDigest: command.sourceDigest, previewDigest: command.previewDigest,
  capturedAt: now, expiresAt: now + 30000, boundaries: PROFILE_BOUNDARIES[selection.scope], allUserDataCompleted: false };
export const emptyCopies = () => Object.fromEntries(COPY_KEYS.map(k => [k, []]));
export const summary = { profileRevision: 4, paceRevision: 7, profileErasureFloor: 0, paceErasureFloor: 0, paceState: 'explicit', presentFields: [...PROFILE_FIELDS], hasPaceRequest: true, hasPaceUndo: true };
export const profile = { displayName: 'Synthetic owner', travelPace: 'packed', locale: 'en', currency: 'USD', distanceUnit: 'mile', temperatureUnit: 'fahrenheit',
  defaultDepartureTime: '10:30:00', paceNotice: 'local-planning-cross-trip-v1', paceOperation: id(4),
  paceRequest: { action: 'save', operationId: id(4), expectedRevision: 6, travelPace: 'packed', noticeVersion: 'local-planning-cross-trip-v1' },
  paceUndo: { travelPace: 'relaxed', state: 'explicit', noticeVersion: 'local-planning-cross-trip-v1' } };
export const copies = { ...emptyCopies(), briefPreviews: [id(6)], sharedBriefs: [id(7)], scopedEditContexts: [id(8)], recoveryContexts: [id(9)] };
export const preview = () => structuredClone({ ...binding, kind: 'preview', profile, summary, copies, conflicts: [], eligible: true, progressCount: 0 });
export const decision = () => structuredClone({ requestDigest: profileDigest(bytes), decidedAt: now + 10, beforeProfileRevision: 4, afterProfileRevision: 5,
  beforePaceRevision: 7, afterPaceRevision: 8, erasedFields: [...PROFILE_FIELDS], briefCasesInvalidated: [id(7)],
  retainedCopies: { ...emptyCopies(), scopedEditContexts: [id(8)], recoveryContexts: [id(9)] }, clearedPreviews: 0, retainedFences: 1,
  sourceProfile: 'cleared', paceConsent: 'revoked', account: 'not_modified', sourceTrip: 'not_modified', explicitMemory: 'not_modified',
  financialProvider: 'not_modified', externalCopies: 'not_erased' });
export const receipt = () => ({ ...binding, kind: 'receipt', state: 'erased', decision: decision() });
export const recover = () => ({ action: 'recover', ...selection, mutationBytes: bytes });
export const unknown = () => ({ schemaVersion: PROFILE_SCHEMA, kind: 'unknown', ...selection, ...actor, requestDigest: profileDigest(bytes), allUserDataCompleted: false });
export const operation = () => ({ ...selection, ...actor, sourceDigest: binding.sourceDigest, previewDigest: binding.previewDigest,
  capturedAt: now, expiresAt: now + 30000, requestDigest: profileDigest(bytes), state: 'erased', previewErased: true, summary: null, copies: null, conflicts: null, decision: decision() });
export const progressSelection = { scope: 'profile-delete-progress/1', requestId: id(10), profileId: null, objectIds: [selection.requestId] };
export const progressCommand = { action: 'erase', ...progressSelection, sourceDigest: command.sourceDigest, previewDigest: command.previewDigest, confirmed: true };
export const progressBytes = `\n${JSON.stringify(progressCommand)}  `;
export const progressBinding = { ...binding, ...progressSelection, boundaries: PROFILE_BOUNDARIES[progressSelection.scope] };
export const progressPreview = () => ({ ...progressBinding, kind: 'preview', profile: null, summary: null, copies: emptyCopies(), conflicts: [], eligible: true, progressCount: 1 });
export const progressReceipt = () => ({ ...progressBinding, kind: 'receipt', state: 'erased', decision: { ...decision(), requestDigest: profileDigest(progressBytes),
  beforeProfileRevision: null, afterProfileRevision: null, beforePaceRevision: null, afterPaceRevision: null, erasedFields: [], briefCasesInvalidated: [],
  retainedCopies: emptyCopies(), clearedPreviews: 1, retainedFences: 1, sourceProfile: 'not_modified', paceConsent: 'not_modified' } });
export const list = () => ({ schemaVersion: PROFILE_SCHEMA, kind: 'list', ...actor, scope: progressSelection.scope, sourceDigest: 'c'.repeat(64),
  capturedAt: now + 40000, expiresAt: now + 70000, items: [operation()], hasMore: false, nextCursor: null, allUserDataCompleted: false });
