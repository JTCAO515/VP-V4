import { exact, record, hash } from '../../guide/contract.ts';
import { isTravelPaceCommand } from '../../memory/travel-pace.ts';
import { PROFILE_SCHEMA, PROFILE_LIMITS, PROFILE_FIELDS, COPY_KEYS, CONFLICTS, bindingKeys, selectionKeys,
  identifier, natural, positive, revision, sortedIds, sameSelection, validSelection, validBinding,
  type ProfileActor, type ProfileCommand, type ProfileBinding } from './contract.ts';

type Selected = Exclude<ProfileCommand, { action: 'list' }>;
const size = (v: unknown) => Buffer.byteLength(JSON.stringify(v) ?? '', 'utf8') <= PROFILE_LIMITS.maxBytes;
const actorMatches = (v: Record<string, unknown>, a: ProfileActor) => v.ownerId === a.ownerId && v.sessionId === a.sessionId && v.mobileEpoch === a.mobileEpoch;
const bound = (v: Record<string, unknown>, c: Selected, a: ProfileActor) => actorMatches(v, a) && sameSelection(v, c)
  && (c.action !== 'erase' || v.sourceDigest === c.sourceDigest && v.previewDigest === c.previewDigest);
export const summaryKeys = ['profileRevision', 'paceRevision', 'profileErasureFloor', 'paceErasureFloor', 'paceState', 'presentFields', 'hasPaceRequest', 'hasPaceUndo'] as const;
export function validSummary(v: unknown): v is Record<string, unknown> {
  if (!record(v)) return false;
  const fields = v.presentFields;
  return record(v) && exact(v, [...summaryKeys]) && revision(v.profileRevision) && revision(v.paceRevision)
    && revision(v.profileErasureFloor) && v.profileErasureFloor <= v.profileRevision && revision(v.paceErasureFloor) && v.paceErasureFloor <= v.paceRevision
    && ['unset', 'explicit', 'paused', 'revoked'].includes(String(v.paceState)) && typeof v.hasPaceRequest === 'boolean' && typeof v.hasPaceUndo === 'boolean'
    && Array.isArray(fields) && fields.length <= PROFILE_FIELDS.length
    && fields.every((s, i) => PROFILE_FIELDS.includes(s) && (i === 0 || PROFILE_FIELDS.indexOf(fields[i - 1] as typeof PROFILE_FIELDS[number]) < PROFILE_FIELDS.indexOf(s)));
}
export function validProfile(v: unknown): v is Record<string, unknown> {
  if (!record(v) || !exact(v, ['displayName', 'travelPace', 'locale', 'currency', 'distanceUnit', 'temperatureUnit', 'defaultDepartureTime',
    'paceNotice', 'paceOperation', 'paceRequest', 'paceUndo']) || !(v.displayName === null || typeof v.displayName === 'string' && v.displayName.length > 0 && Array.from(v.displayName).length <= 80)
    || !['relaxed', 'balanced', 'packed'].includes(String(v.travelPace)) || !['zh', 'en', 'es', 'ru', 'ar'].includes(String(v.locale))
    || !['CNY', 'USD', 'EUR', 'RUB', 'SAR'].includes(String(v.currency)) || !['kilometre', 'mile'].includes(String(v.distanceUnit))
    || !['celsius', 'fahrenheit'].includes(String(v.temperatureUnit)) || typeof v.defaultDepartureTime !== 'string'
    || !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?$/.test(v.defaultDepartureTime)
    || !(v.paceNotice === null || v.paceNotice === 'local-planning-cross-trip-v1') || !(v.paceOperation === null || identifier(v.paceOperation))
    || !(v.paceRequest === null || isTravelPaceCommand(v.paceRequest))) return false;
  const undo = v.paceUndo;
  return undo === null || record(undo) && exact(undo, ['travelPace', 'state', 'noticeVersion'])
    && ['relaxed', 'balanced', 'packed'].includes(String(undo.travelPace)) && ['unset', 'explicit', 'paused', 'revoked'].includes(String(undo.state))
    && (undo.noticeVersion === null || undo.noticeVersion === 'local-planning-cross-trip-v1')
    && (!['explicit', 'paused'].includes(String(undo.state)) || undo.noticeVersion === 'local-planning-cross-trip-v1');
}
export function validCopies(v: unknown): v is Record<typeof COPY_KEYS[number], string[]> {
  return record(v) && exact(v, [...COPY_KEYS]) && COPY_KEYS.every(k => sortedIds(v[k]))
    && COPY_KEYS.reduce((n, k) => n + (v[k] as string[]).length, 0) <= PROFILE_LIMITS.rows;
}
const conflicts = (v: unknown): v is string[] => Array.isArray(v) && v.length <= CONFLICTS.length
  && v.every((s, i) => CONFLICTS.includes(s) && (i === 0 || CONFLICTS.indexOf(v[i - 1]) < CONFLICTS.indexOf(s)));
const emptyCopies = (v: Record<typeof COPY_KEYS[number], string[]>) => COPY_KEYS.every(k => v[k].length === 0);
export function decodeProfilePreview(v: unknown, c: Selected, a: ProfileActor, now: number): Record<string, unknown> | null {
  if (!record(v) || !exact(v, [...bindingKeys, 'kind', 'profile', 'summary', 'copies', 'conflicts', 'eligible', 'progressCount'])
    || !validBinding(v, now) || !bound(v, c, a) || v.kind !== 'preview' || !validCopies(v.copies) || !conflicts(v.conflicts)
    || v.eligible !== (v.conflicts.length === 0) || !natural(v.progressCount) || !size(v)) return null;
  if (v.scope === 'profile-sensitive-data/1') {
    if (!validProfile(v.profile) || !validSummary(v.summary) || v.progressCount !== 0) return null;
    if (v.summary.hasPaceRequest !== (v.profile.paceRequest !== null) || v.summary.hasPaceUndo !== (v.profile.paceUndo !== null)
      || ['explicit', 'paused'].includes(String(v.summary.paceState)) && v.profile.paceNotice !== 'local-planning-cross-trip-v1') return null;
    if ((v.profile.paceRequest === null) !== (v.profile.paceOperation === null)
      || v.profile.paceRequest !== null && (!record(v.profile.paceRequest) || typeof v.profile.paceRequest.operationId !== 'string'
        || v.profile.paceRequest.operationId.toLowerCase() !== v.profile.paceOperation || Number(v.profile.paceRequest.expectedRevision) + 1 !== v.summary.paceRevision)
      || v.profile.paceUndo !== null && (!record(v.profile.paceRequest) || v.profile.paceRequest.action !== 'save')
      || !['explicit', 'paused'].includes(String(v.summary.paceState)) && v.profile.paceNotice !== null) return null;
  } else if (v.profile !== null || v.summary !== null || !emptyCopies(v.copies) || v.progressCount !== c.objectIds.length) return null;
  return v;
}
export const decisionKeys = ['requestDigest', 'decidedAt', 'beforeProfileRevision', 'afterProfileRevision', 'beforePaceRevision', 'afterPaceRevision',
  'erasedFields', 'briefCasesInvalidated', 'retainedCopies', 'clearedPreviews', 'retainedFences', 'sourceProfile', 'paceConsent',
  'account', 'sourceTrip', 'explicitMemory', 'financialProvider', 'externalCopies'] as const;
export type ProfileDecision = Readonly<Record<typeof decisionKeys[number], unknown>>;
export type ProfileReceipt = ProfileBinding & Readonly<{ kind: 'receipt'; state: 'erased'; decision: ProfileDecision }>;
export function validDecision(v: unknown, scope: string, capturedAt: number, expiresAt: number, now: number, selected: number): v is ProfileDecision {
  if (!record(v) || !exact(v, [...decisionKeys]) || !hash(v.requestDigest) || !positive(v.decidedAt) || v.decidedAt < capturedAt || v.decidedAt >= expiresAt || v.decidedAt > now
    || !sortedIds(v.briefCasesInvalidated) || !validCopies(v.retainedCopies) || !natural(v.clearedPreviews) || !natural(v.retainedFences)
    || v.account !== 'not_modified' || v.sourceTrip !== 'not_modified' || v.explicitMemory !== 'not_modified'
    || v.financialProvider !== 'not_modified' || v.externalCopies !== 'not_erased') return false;
  if (scope === 'profile-sensitive-data/1') return v.sourceProfile === 'cleared' && v.paceConsent === 'revoked'
    && revision(v.beforeProfileRevision) && revision(v.afterProfileRevision) && v.afterProfileRevision === v.beforeProfileRevision + 1
    && revision(v.beforePaceRevision) && revision(v.afterPaceRevision) && v.afterPaceRevision === v.beforePaceRevision + 1
    && JSON.stringify(v.erasedFields) === JSON.stringify(PROFILE_FIELDS) && v.clearedPreviews === 0 && v.retainedFences === 1
    && v.retainedCopies.briefPreviews.length === 0 && v.retainedCopies.sharedBriefs.length === 0;
  return v.sourceProfile === 'not_modified' && v.paceConsent === 'not_modified'
    && [v.beforeProfileRevision, v.afterProfileRevision, v.beforePaceRevision, v.afterPaceRevision].every(x => x === null)
    && Array.isArray(v.erasedFields) && v.erasedFields.length === 0 && v.briefCasesInvalidated.length === 0 && emptyCopies(v.retainedCopies)
    && v.clearedPreviews <= selected && v.retainedFences === selected;
}
export function decodeProfileReceipt(v: unknown, c: Selected, a: ProfileActor, digest: string, now: number): ProfileReceipt | null {
  return record(v) && exact(v, [...bindingKeys, 'kind', 'state', 'decision']) && validBinding(v, now, true) && bound(v, c, a)
    && v.kind === 'receipt' && v.state === 'erased' && validDecision(v.decision, v.scope, v.capturedAt, v.expiresAt, now, c.objectIds.length)
    && v.decision.requestDigest === digest && size(v) ? v as ProfileReceipt : null;
}
export function decodeProfileUnknown(v: unknown, c: Selected, a: ProfileActor, digest: string): boolean {
  return record(v) && exact(v, ['schemaVersion', 'kind', ...selectionKeys, 'ownerId', 'sessionId', 'mobileEpoch', 'requestDigest', 'allUserDataCompleted'])
    && v.schemaVersion === PROFILE_SCHEMA && v.kind === 'unknown' && actorMatches(v, a) && sameSelection(v, c)
    && v.requestDigest === digest && v.allUserDataCompleted === false && size(v);
}
export const operationKeys = ['requestId', 'ownerId', 'sessionId', 'mobileEpoch', 'scope', 'profileId', 'objectIds', 'sourceDigest', 'previewDigest',
  'capturedAt', 'expiresAt', 'requestDigest', 'state', 'previewErased', 'summary', 'copies', 'conflicts', 'decision'] as const;
export function validOperationRow(v: unknown, owner: string, now: number): boolean {
  if (!record(v) || !exact(v, [...operationKeys]) || !validSelection(v) || v.ownerId !== owner || !identifier(v.sessionId) || !positive(v.mobileEpoch)
    || v.scope === 'profile-sensitive-data/1' && v.profileId !== owner || !hash(v.sourceDigest) || !hash(v.previewDigest) || !positive(v.capturedAt) || v.capturedAt > now
    || v.expiresAt !== v.capturedAt + PROFILE_LIMITS.lifetimeMs || !['previewed', 'erased'].includes(String(v.state)) || typeof v.previewErased !== 'boolean') return false;
  if (v.previewErased ? [v.summary, v.copies, v.conflicts].some(x => x !== null)
    : (v.scope === 'profile-sensitive-data/1' ? !validSummary(v.summary) : v.summary !== null) || !validCopies(v.copies) || !conflicts(v.conflicts)
      || v.scope === 'profile-delete-progress/1' && !emptyCopies(v.copies)) return false;
  return v.state === 'previewed' ? v.requestDigest === null && v.decision === null
    : v.previewErased && hash(v.requestDigest) && validDecision(v.decision, String(v.scope), v.capturedAt, Number(v.expiresAt), now, (v.objectIds as string[]).length)
      && v.decision.requestDigest === v.requestDigest;
}
export function decodeProfileList(v: unknown, c: Extract<ProfileCommand, { action: 'list' }>, a: ProfileActor, now: number): Record<string, unknown> | null {
  if (!record(v) || !exact(v, ['schemaVersion', 'kind', 'scope', 'ownerId', 'sessionId', 'mobileEpoch', 'sourceDigest', 'capturedAt', 'expiresAt', 'items', 'hasMore', 'nextCursor', 'allUserDataCompleted'])
    || v.schemaVersion !== PROFILE_SCHEMA || v.kind !== 'list' || v.scope !== c.scope || !actorMatches(v, a) || !hash(v.sourceDigest)
    || !positive(v.capturedAt) || v.capturedAt > now || v.expiresAt !== v.capturedAt + PROFILE_LIMITS.lifetimeMs || Number(v.expiresAt) <= now
    || c.cursor && c.cursor.sourceDigest !== v.sourceDigest || !Array.isArray(v.items) || v.items.length > 20 || typeof v.hasMore !== 'boolean' || v.allUserDataCompleted !== false || !size(v)) return null;
  let last = c.cursor?.afterId ?? '';
  for (const item of v.items) {
    if (!record(item)) return null;
    const id = v.scope === 'profile-sensitive-data/1' ? item.profileId : item.requestId;
    if (!identifier(id) || id <= last) return null;
    if (v.scope === 'profile-sensitive-data/1' ? !exact(item, ['profileId', 'summary']) || item.profileId !== a.ownerId || !validSummary(item.summary)
      : !validOperationRow(item, a.ownerId, now)) return null;
    last = id;
  }
  if (v.scope === 'profile-sensitive-data/1' && (v.items.length > 1 || v.hasMore)) return null;
  if (v.hasMore ? v.items.length !== 20 || !record(v.nextCursor) || !exact(v.nextCursor, ['sourceDigest', 'afterId']) || v.nextCursor.sourceDigest !== v.sourceDigest || v.nextCursor.afterId !== last : v.nextCursor !== null) return null;
  return v;
}
