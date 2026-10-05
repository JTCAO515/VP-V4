import { createHash } from 'node:crypto';
import { exact, record, uuid, hash } from '../../guide/contract.ts';

export const COVERAGE_PROGRESS_SCHEMA = 'coverage-progress-data/1' as const;
export const COVERAGE_PROGRESS_SCOPES = ['coverage-progress-data/1'] as const;
export type CoverageProgressScope = typeof COVERAGE_PROGRESS_SCOPES[number];
export const COVERAGE_PROGRESS_LIMITS = { selected: 20, pageSize: 5, maxPages: 4, maxRows: 20, tableRows: 10000, maxBytes: 1000000, lifetimeMs: 30000 } as const;
export const coverageProgressDigest = (bytes: string) => createHash('sha256').update(bytes, 'utf8').digest('hex');
export const natural = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export const positive = (v: unknown): v is number => natural(v) && v > 0;
export const coverageProgressEffectCounts = ['collectorRequests','collectorSections','exitPages','retainedFences'] as const;
export function validCoverageProgressEffects(v: unknown): v is Record<string, unknown> {
  return record(v) && exact(v, [...coverageProgressEffectCounts,'sourceData','sessionAccountFences','externalCopies'])
    && coverageProgressEffectCounts.every(k => natural(v[k]) && v[k] <= COVERAGE_PROGRESS_LIMITS.selected * (k === 'collectorSections' ? 2 : 1))
    && v.sourceData === 'not_modified' && v.sessionAccountFences === 'retained' && v.externalCopies === 'not_erased';
}
export const coverageProgressScope = (v: unknown): v is CoverageProgressScope => COVERAGE_PROGRESS_SCOPES.includes(v as CoverageProgressScope);
export const selectedIds = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.length <= COVERAGE_PROGRESS_LIMITS.selected
  && v.every((id, i) => uuid(id) && id === id.toLowerCase() && (i === 0 || id > v[i - 1]));
export type CoverageProgressActor = Readonly<{ ownerId: string; sessionId: string; mobileEpoch: number }>;
export type CoverageProgressSelection = Readonly<{ scope: CoverageProgressScope; requestId: string; objectIds: readonly string[] }>;
export type CoverageProgressCommand =
  | Readonly<{ action: 'list'; scope: CoverageProgressScope; cursor: Readonly<{ sourceDigest: string; afterId: string }> | null; limit: 20 }>
  | CoverageProgressSelection & Readonly<{ action: 'preview' }>
  | CoverageProgressSelection & Readonly<{ action: 'export' | 'erase'; previewDigest: string; confirmed: true }>
  | CoverageProgressSelection & Readonly<{ action: 'recover'; mutationBytes: string }>;

/** Authenticated owner is derived from the current session, never accepted in a DTO. */
export function parseCoverageProgressCommand(v: unknown, recovering = false): CoverageProgressCommand | null {
  if (!record(v) || !coverageProgressScope(v.scope)) return null;
  if (v.action === 'list') return exact(v, ['action','scope','cursor','limit']) && v.limit === 20 && (v.cursor === null
    || record(v.cursor) && exact(v.cursor, ['sourceDigest','afterId']) && hash(v.cursor.sourceDigest) && uuid(v.cursor.afterId)
      && v.cursor.afterId === v.cursor.afterId.toLowerCase()) ? v as CoverageProgressCommand : null;
  if (!uuid(v.requestId) || v.requestId !== v.requestId.toLowerCase() || !selectedIds(v.objectIds)
    || v.objectIds.includes(v.requestId)) return null;
  const keys = ['action','scope','requestId','objectIds'];
  if (v.action === 'preview') return exact(v, keys) ? v as CoverageProgressCommand : null;
  if (v.action === 'export' || v.action === 'erase') return exact(v, [...keys,'previewDigest','confirmed'])
    && hash(v.previewDigest) && v.confirmed === true ? v as CoverageProgressCommand : null;
  if (v.action !== 'recover' || recovering || !exact(v, [...keys,'mutationBytes']) || typeof v.mutationBytes !== 'string'
    || Buffer.byteLength(v.mutationBytes, 'utf8') > 8192) return null;
  let prior: unknown; try { prior = JSON.parse(v.mutationBytes); } catch { return null; }
  const command = parseCoverageProgressCommand(prior, true);
  return command?.action === 'erase' && command.scope === v.scope && command.requestId === v.requestId
    && JSON.stringify(command.objectIds) === JSON.stringify(v.objectIds) ? v as CoverageProgressCommand : null;
}

export const COVERAGE_PROGRESS_BOUNDARIES = {
  'coverage-progress-data/1': {
    exportFields: ['selected_collector_all_request_fields','selected_collector_all_section_fields','selected_collector_all_fence_fields','selected_exit_all_request_fields','selected_exit_all_page_fields','minimal_exit_receipt'],
    eraseFields: ['selected_collector_transient_requests_and_sections','selected_exit_transient_page_progress'],
    retained: ['original_request_id_owner_session_scope_expiry_fences','nonreplayable_exit_bindings_selection_digests_decision_receipts','original_session_account_cascade_semantics'],
    missing: ['unselected_progress_records','source_data_in_separate_domains','external_export_files','backup_restore_target_acceptance'],
  },
} as const;
export function validCoverageProgressBoundaries(v: unknown, scope: CoverageProgressScope): boolean {
  return record(v) && exact(v, ['exportFields','eraseFields','retained','missing'])
    && Object.entries(COVERAGE_PROGRESS_BOUNDARIES[scope]).every(([k, values]) => JSON.stringify(v[k]) === JSON.stringify(values));
}
export const coverageProgressBindingKeys = ['schemaVersion','scope','requestId','objectIds','ownerId','sessionId','mobileEpoch','sourceDigest','previewDigest','capturedAt','expiresAt','boundaries','allUserDataCompleted'] as const;
export type CoverageProgressBinding = CoverageProgressSelection & CoverageProgressActor & Readonly<{
  schemaVersion: typeof COVERAGE_PROGRESS_SCHEMA; sourceDigest: string; previewDigest: string; capturedAt: number; expiresAt: number;
  boundaries: typeof COVERAGE_PROGRESS_BOUNDARIES[CoverageProgressScope]; allUserDataCompleted: false;
}>;
export function validCoverageProgressBinding(v: Record<string, unknown>, now: number, allowExpired = false): v is Record<string, unknown> & CoverageProgressBinding {
  return v.schemaVersion === COVERAGE_PROGRESS_SCHEMA && coverageProgressScope(v.scope) && [v.requestId,v.ownerId,v.sessionId].every(uuid)
    && selectedIds(v.objectIds) && !v.objectIds.includes(String(v.requestId)) && positive(v.mobileEpoch) && hash(v.sourceDigest) && hash(v.previewDigest)
    && positive(v.capturedAt) && positive(v.expiresAt) && v.capturedAt <= now && v.expiresAt === v.capturedAt + COVERAGE_PROGRESS_LIMITS.lifetimeMs
    && (allowExpired || now < v.expiresAt) && validCoverageProgressBoundaries(v.boundaries, v.scope) && v.allUserDataCompleted === false;
}
export function sameCoverageProgressSelection(v: Record<string, unknown>, selection: CoverageProgressSelection, actor: CoverageProgressActor): boolean {
  return v.scope === selection.scope && v.requestId === selection.requestId && JSON.stringify(v.objectIds) === JSON.stringify(selection.objectIds)
    && v.ownerId === actor.ownerId && v.sessionId === actor.sessionId && v.mobileEpoch === actor.mobileEpoch;
}
