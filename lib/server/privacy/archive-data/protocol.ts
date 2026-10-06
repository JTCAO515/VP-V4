import { exact, record, uuid, hash } from '../../guide/contract.ts';
import { isLifecycleTrip } from '../../trip/lifecycle/contract.ts';
import { exportCanonical } from '../export-dispatcher.ts';
import { ARCHIVE_SCHEMA, ARCHIVE_LIMITS, archiveBindingKeys, validArchiveBinding, sameArchiveSelection,
  natural, positive, archiveScope, sectionsFor, type ArchiveActor, type ArchiveBinding, type ArchiveCommand } from './contract.ts';
import { archiveRowKey } from './rows.ts';

export type ArchiveBundle = ArchiveBinding & Readonly<{ kind: 'bundle'; requestDigest: string;
  sections: readonly Readonly<{ section: string; items: readonly unknown[] }>[]; proof: Readonly<{ coverage: 'complete'; pages: number; rows: number }> }>;
export type ArchiveReceipt = ArchiveBinding & Readonly<{ kind: 'receipt'; requestDigest: string; state: 'erased'; decidedAt: number;
  effects: Readonly<{ clearedProgress: number; retainedFences: number; sourceTrip: 'not_modified'; externalCopies: 'not_erased' }> }>;
const size = (v: unknown) => Buffer.byteLength(JSON.stringify(v) ?? '', 'utf8') <= ARCHIVE_LIMITS.maxBytes;
export const sameArchiveBinding = (v: Record<string, unknown>, b: ArchiveBinding) => archiveBindingKeys.every(k => exportCanonical(v[k]) === exportCanonical(b[k]));
type SelectionCommand = Exclude<ArchiveCommand, { action: 'list' }>;
export function decodeArchivePreview(v: unknown, command: SelectionCommand, actor: ArchiveActor, now: number): Record<string, unknown> | null {
  if (!record(v) || !exact(v, [...archiveBindingKeys,'kind','counts','snapshotVersionGaps']) || !validArchiveBinding(v, now)
    || !sameArchiveSelection(v, command, actor) || v.kind !== 'preview' || !record(v.counts) || !exact(v.counts, ['trip','snapshots','operations','progress'])
    || !['trip','snapshots','operations','progress'].every(k => record(v.counts) && natural(v.counts[k]) && v.counts[k] <= 10000)
    || !natural(v.snapshotVersionGaps) || !size(v)) return null;
  const c = v.counts;
  if (v.scope === 'archived-trip-data/1' ? c.trip !== 1 || Number(c.snapshots) < 1 || c.progress !== 0
    || v.snapshotVersionGaps !== Number(v.tripVersion) + 1 - Number(c.snapshots)
    : c.trip !== 0 || c.snapshots !== 0 || c.operations !== 0 || c.progress !== command.objectIds.length || v.snapshotVersionGaps !== 0) return null;
  return v;
}
export function decodeArchiveList(v: unknown, command: Extract<ArchiveCommand, { action: 'list' }>, actor: ArchiveActor, now: number): Record<string, unknown> | null {
  if (!record(v) || !exact(v, ['schemaVersion','kind','scope','ownerId','sessionId','mobileEpoch','sourceDigest','capturedAt','expiresAt','items','hasMore','nextCursor','allUserDataCompleted'])
    || v.schemaVersion !== ARCHIVE_SCHEMA || v.kind !== 'list' || v.scope !== command.scope || v.ownerId !== actor.ownerId || v.sessionId !== actor.sessionId
    || v.mobileEpoch !== actor.mobileEpoch || !hash(v.sourceDigest) || !positive(v.capturedAt) || !positive(v.expiresAt) || v.capturedAt > now
    || v.expiresAt !== v.capturedAt + ARCHIVE_LIMITS.lifetimeMs || v.expiresAt <= now || command.cursor && command.cursor.sourceDigest !== v.sourceDigest
    || !Array.isArray(v.items) || v.items.length > 20 || typeof v.hasMore !== 'boolean' || v.allUserDataCompleted !== false || !size(v)) return null;
  let last = command.cursor?.afterId ?? '';
  for (const item of v.items) {
    if (!record(item)) return null;
    if (command.scope === 'archived-trip-data/1') {
      if (!isLifecycleTrip(item) || item.state !== 'archived') return null;
      if (item.tripId <= last) return null; last = item.tripId;
    } else {
      if (!exact(item, ['objectId','originalScope','tripId','tripVersion','state','progressErased']) || !uuid(item.objectId) || item.objectId <= last
        || !archiveScope(item.originalScope) || typeof item.state !== 'string' || !['previewed','exporting','exported','erased'].includes(item.state) || typeof item.progressErased !== 'boolean'
        || (item.originalScope === 'archived-trip-data/1' ? !uuid(item.tripId) || !positive(item.tripVersion) || item.tripVersion > 2147483647
          : item.tripId !== null || item.tripVersion !== null)) return null;
      last = item.objectId;
    }
  }
  if (v.hasMore ? v.items.length !== 20 || !record(v.nextCursor) || !exact(v.nextCursor, ['sourceDigest','afterId'])
    || v.nextCursor.sourceDigest !== v.sourceDigest || v.nextCursor.afterId !== last : v.nextCursor !== null) return null;
  return v;
}
export function decodeArchiveBundle(v: unknown, command?: SelectionCommand, actor?: ArchiveActor, now = Date.now()): ArchiveBundle | null {
  if (!record(v) || !exact(v, [...archiveBindingKeys,'kind','requestDigest','sections','proof']) || !validArchiveBinding(v, now) || v.kind !== 'bundle'
    || !hash(v.requestDigest) || command && (!actor || !sameArchiveSelection(v, command, actor) || 'previewDigest' in command && v.previewDigest !== command.previewDigest)
    || !Array.isArray(v.sections) || !record(v.proof) || !exact(v.proof, ['coverage','pages','rows']) || v.proof.coverage !== 'complete'
    || !positive(v.proof.pages) || v.proof.pages > ARCHIVE_LIMITS.maxPages || !natural(v.proof.rows) || v.proof.rows > ARCHIVE_LIMITS.maxRows || !size(v)) return null;
  const expected = sectionsFor(v.scope); let rows = 0; let minimumPages = 0;
  if (v.sections.length !== expected.length) return null;
  for (let i = 0; i < expected.length; i++) {
    const part = v.sections[i];
    if (!record(part) || !exact(part, ['section','items']) || part.section !== expected[i] || !Array.isArray(part.items)
      || part.items.length > (part.section === 'trip' ? 1 : part.section === 'progress' ? ARCHIVE_LIMITS.selected : 10000)) return null;
    let last = '';
    for (let j = 0; j < part.items.length; j++) {
      const key = archiveRowKey(String(part.section), part.items[j], v);
      if (!key || key <= last || part.section === 'progress' && key !== v.objectIds[j]) return null;
      last = key;
    }
    if (part.section === 'trip' && part.items.length !== 1 || part.section === 'snapshots' && part.items.length < 1
      || part.section === 'progress' && part.items.length !== v.objectIds.length) return null;
    rows += part.items.length; minimumPages += Math.max(1, Math.ceil(part.items.length / ARCHIVE_LIMITS.pageSize));
  }
  if (v.scope === 'archived-trip-data/1') {
    const trip = (v.sections[0] as { items: Record<string, unknown>[] }).items[0];
    const head = (v.sections[1] as { items: Record<string, unknown>[] }).items.find(s => s.version === v.tripVersion);
    if (!head || head.title !== trip.title || exportCanonical(head.content) !== exportCanonical(trip.content)) return null;
  }
  if (v.proof.rows !== rows || v.proof.pages !== minimumPages) return null;
  return v as ArchiveBundle;
}
export function decodeArchiveReceipt(v: unknown, command?: SelectionCommand, actor?: ArchiveActor, digest?: string, now = Date.now()): ArchiveReceipt | null {
  if (!record(v) || !exact(v, [...archiveBindingKeys,'kind','requestDigest','state','decidedAt','effects']) || !validArchiveBinding(v, now, true)
    || v.scope !== 'archive-export-progress/1' || v.kind !== 'receipt' || v.state !== 'erased' || !hash(v.requestDigest) || digest && v.requestDigest !== digest
    || !positive(v.decidedAt) || v.decidedAt < v.capturedAt || v.decidedAt >= v.expiresAt || v.decidedAt > now
    || command && (!actor || !sameArchiveSelection(v, command, actor) || 'previewDigest' in command && v.previewDigest !== command.previewDigest)
    || !record(v.effects) || !exact(v.effects, ['clearedProgress','retainedFences','sourceTrip','externalCopies'])
    || !natural(v.effects.clearedProgress) || v.effects.clearedProgress > v.objectIds.length * 3 || v.effects.retainedFences !== v.objectIds.length
    || v.effects.sourceTrip !== 'not_modified' || v.effects.externalCopies !== 'not_erased' || !size(v)) return null;
  return v as ArchiveReceipt;
}
export function decodeArchiveUnknown(v: unknown, command: SelectionCommand, actor: ArchiveActor, digest: string): boolean {
  return record(v) && exact(v, ['schemaVersion','kind','scope','requestId','tripId','tripVersion','objectIds','ownerId','sessionId','mobileEpoch','requestDigest','allUserDataCompleted'])
    && v.schemaVersion === ARCHIVE_SCHEMA && v.kind === 'unknown' && sameArchiveSelection(v, command, actor) && v.requestDigest === digest && v.allUserDataCompleted === false && size(v);
}
export function decodeArchiveValidated(v: unknown, command: SelectionCommand, actor: ArchiveActor, now: number): boolean {
  return record(v) && exact(v, [...archiveBindingKeys,'kind','requestDigest','current']) && validArchiveBinding(v, now) && sameArchiveSelection(v, command, actor)
    && 'previewDigest' in command && v.previewDigest === command.previewDigest && v.kind === 'validated' && hash(v.requestDigest) && v.current === true && size(v);
}
