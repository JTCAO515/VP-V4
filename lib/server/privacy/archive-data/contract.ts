import { createHash } from 'node:crypto';
import { exact, record, uuid, hash } from '../../guide/contract.ts';

export const ARCHIVE_SCHEMA = 'archive-data/1' as const;
export const ARCHIVE_SCOPES = ['archived-trip-data/1', 'archive-export-progress/1'] as const;
export type ArchiveScope = typeof ARCHIVE_SCOPES[number];
export const ARCHIVE_LIMITS = { selected: 20, pageSize: 50, maxPages: 402, maxRows: 20001, tableRows: 10000, maxBytes: 1000000, lifetimeMs: 30000 } as const;
export const archiveDigest = (bytes: string) => createHash('sha256').update(bytes, 'utf8').digest('hex');
export const natural = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export const positive = (v: unknown): v is number => natural(v) && v > 0;
export const archiveScope = (v: unknown): v is ArchiveScope => ARCHIVE_SCOPES.includes(v as ArchiveScope);
export const ids = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.length <= ARCHIVE_LIMITS.selected
  && v.every((id, i) => uuid(id) && id === id.toLowerCase() && (i === 0 || id > v[i - 1]));
export type ArchiveActor = Readonly<{ ownerId: string; sessionId: string; mobileEpoch: number }>;
export type ArchiveSelection = Readonly<{ scope: ArchiveScope; requestId: string; tripId: string | null; tripVersion: number | null; objectIds: readonly string[] }>;
export type ArchiveCommand =
  | Readonly<{ action: 'list'; scope: ArchiveScope; cursor: Readonly<{ sourceDigest: string; afterId: string }> | null; limit: 20 }>
  | ArchiveSelection & Readonly<{ action: 'preview' }>
  | ArchiveSelection & Readonly<{ action: 'export' | 'erase' | 'validate'; previewDigest: string; confirmed: true }>
  | ArchiveSelection & Readonly<{ action: 'recover'; mutationBytes: string }>;
export function parseArchiveCommand(v: unknown, recovering = false): ArchiveCommand | null {
  if (!record(v) || !archiveScope(v.scope)) return null;
  if (v.action === 'list') return exact(v, ['action','scope','cursor','limit']) && v.limit === 20 && (v.cursor === null
    || record(v.cursor) && exact(v.cursor, ['sourceDigest','afterId']) && hash(v.cursor.sourceDigest) && uuid(v.cursor.afterId)
      && v.cursor.afterId === v.cursor.afterId.toLowerCase()) ? v as ArchiveCommand : null;
  if (!uuid(v.requestId) || v.requestId !== v.requestId.toLowerCase() || !Array.isArray(v.objectIds)) return null;
  if (v.scope === 'archived-trip-data/1') {
    if (!uuid(v.tripId) || v.tripId !== v.tripId.toLowerCase() || !positive(v.tripVersion) || v.tripVersion > 2147483647 || v.objectIds.length !== 0) return null;
  } else if (v.tripId !== null || v.tripVersion !== null || !ids(v.objectIds) || v.objectIds.includes(v.requestId)) return null;
  const keys = ['action','scope','requestId','tripId','tripVersion','objectIds'];
  if (v.action === 'preview') return exact(v, keys) ? v as ArchiveCommand : null;
  if (v.action === 'export' || v.action === 'erase' || v.action === 'validate') return exact(v, [...keys,'previewDigest','confirmed']) && hash(v.previewDigest)
    && v.confirmed === true && !(v.action === 'erase' && v.scope !== 'archive-export-progress/1') ? v as ArchiveCommand : null;
  if (v.action !== 'recover' || recovering || !exact(v, [...keys,'mutationBytes']) || typeof v.mutationBytes !== 'string'
    || Buffer.byteLength(v.mutationBytes, 'utf8') > 8192) return null;
  let prior: unknown; try { prior = JSON.parse(v.mutationBytes); } catch { return null; }
  const command = parseArchiveCommand(prior, true);
  return command?.action === 'erase' && command.scope === v.scope && command.requestId === v.requestId && command.tripId === v.tripId
    && command.tripVersion === v.tripVersion && JSON.stringify(command.objectIds) === JSON.stringify(v.objectIds) ? v as ArchiveCommand : null;
}
export const ARCHIVE_BOUNDARIES = {
  'archived-trip-data/1': {
    exportFields: ['archived_trip_id_title_head_confirmation_lifecycle','head_snapshot_safe_days_items','all_available_snapshot_versions_titles_timestamps_safe_content','selected_trip_lifecycle_operation_receipts'],
    eraseFields: [],
    retained: ['original_archive_terminal_business_state','confirmed_trip_proposal_history','original_selected_trip_deletion_receipt','financial_records','operation_fences'],
    missing: ['snapshot_versions_never_stored','fields_outside_original_safe_content_projection','other_domains_use_existing_module_handlers','raw_pdf_attachment_device_bytes','external_orders_payments_copies','backup_restore_target_acceptance'],
  },
  'archive-export-progress/1': {
    exportFields: ['selected_request_all_binding_fields','selected_request_page_progress','selected_request_minimal_erasure_receipt'],
    eraseFields: ['selected_transient_page_progress'],
    retained: ['nonreplayable_request_owner_session_epoch_scope_selection_source_preview_request_hash_time_fences','immutable_minimal_erasure_receipt','original_session_account_cascade_semantics'],
    missing: ['unselected_requests','source_trip_data_separate_original_delete_handler','external_files_copies','backup_restore_target_acceptance'],
  },
} as const;
export function validArchiveBoundaries(v: unknown, scope: ArchiveScope): boolean {
  return record(v) && exact(v, ['exportFields','eraseFields','retained','missing'])
    && Object.entries(ARCHIVE_BOUNDARIES[scope]).every(([k, values]) => JSON.stringify(v[k]) === JSON.stringify(values));
}
export const archiveBindingKeys = ['schemaVersion','scope','requestId','tripId','tripVersion','objectIds','ownerId','sessionId','mobileEpoch','sourceDigest','previewDigest','capturedAt','expiresAt','boundaries','allUserDataCompleted'] as const;
export type ArchiveBinding = ArchiveSelection & ArchiveActor & Readonly<{ schemaVersion: typeof ARCHIVE_SCHEMA; sourceDigest: string;
  previewDigest: string; capturedAt: number; expiresAt: number; boundaries: typeof ARCHIVE_BOUNDARIES[ArchiveScope]; allUserDataCompleted: false }>;
export function validArchiveBinding(v: Record<string, unknown>, now: number, allowExpired = false): v is Record<string, unknown> & ArchiveBinding {
  return v.schemaVersion === ARCHIVE_SCHEMA && parseArchiveCommand({ action: 'preview', scope: v.scope, requestId: v.requestId,
    tripId: v.tripId, tripVersion: v.tripVersion, objectIds: v.objectIds }) !== null && [v.ownerId,v.sessionId].every(uuid)
    && positive(v.mobileEpoch) && hash(v.sourceDigest) && hash(v.previewDigest) && positive(v.capturedAt) && positive(v.expiresAt)
    && v.capturedAt <= now && v.expiresAt === v.capturedAt + ARCHIVE_LIMITS.lifetimeMs && (allowExpired || now < v.expiresAt)
    && validArchiveBoundaries(v.boundaries, v.scope as ArchiveScope) && v.allUserDataCompleted === false;
}
export function sameArchiveSelection(v: Record<string, unknown>, selection: ArchiveSelection, actor: ArchiveActor): boolean {
  return v.scope === selection.scope && v.requestId === selection.requestId && v.tripId === selection.tripId && v.tripVersion === selection.tripVersion
    && JSON.stringify(v.objectIds) === JSON.stringify(selection.objectIds) && v.ownerId === actor.ownerId && v.sessionId === actor.sessionId && v.mobileEpoch === actor.mobileEpoch;
}
export const sectionsFor = (scope: ArchiveScope): readonly string[] => scope === 'archived-trip-data/1' ? ['trip','snapshots','operations'] : ['progress'];
