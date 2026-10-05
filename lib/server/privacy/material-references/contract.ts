import { createHash } from 'node:crypto';
import { exact, record, hash, uuid } from '../../guide/contract.ts';

export const MATERIAL_SCHEMA = 'material-reference-data/1' as const;
export const MATERIAL_SCOPES = ['reservation-reference-data/1', 'pdf-intake-data/1', 'material-exit-progress/1'] as const;
export type MaterialScope = typeof MATERIAL_SCOPES[number];
export const MATERIAL_LIMITS = { selected: 20, pageSize: 5, maxPages: 4, maxRows: 20, maxBytes: 1000000, lifetimeMs: 30000 } as const;
export const materialDigest = (raw: string) => createHash('sha256').update(raw, 'utf8').digest('hex');
export const materialScope = (v: unknown): v is MaterialScope => MATERIAL_SCOPES.includes(v as MaterialScope);
export const natural = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export const positive = (v: unknown): v is number => natural(v) && v > 0;
export const selectedIds = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.length <= MATERIAL_LIMITS.selected
  && v.every((id, i) => uuid(id) && id === id.toLowerCase() && (i === 0 || id > v[i - 1]));
export type MaterialSelection = Readonly<{ scope: MaterialScope; requestId: string; tripId: string; objectIds: readonly string[] }>;
export type MaterialCommand =
  | Readonly<{ action: 'list'; scope: MaterialScope; tripId: string; cursor: Readonly<{ sourceDigest: string; afterId: string }> | null; limit: 20 }>
  | MaterialSelection & Readonly<{ action: 'preview' }>
  | MaterialSelection & Readonly<{ action: 'export' | 'erase'; previewDigest: string; confirmed: true }>
  | MaterialSelection & Readonly<{ action: 'recover'; mutationBytes: string }>;

/** Only exact selected objects. No owner, endpoint, provider, service lease or bulk scope. */
export function parseMaterialCommand(v: unknown, recovering = false): MaterialCommand | null {
  if (!record(v) || !materialScope(v.scope) || !uuid(v.tripId) || v.tripId !== v.tripId.toLowerCase()) return null;
  if (v.action === 'list') return exact(v, ['action','scope','tripId','cursor','limit']) && v.limit === 20
    && (v.cursor === null || record(v.cursor) && exact(v.cursor, ['sourceDigest','afterId']) && hash(v.cursor.sourceDigest)
      && uuid(v.cursor.afterId) && v.cursor.afterId === v.cursor.afterId.toLowerCase()) ? v as MaterialCommand : null;
  if (!uuid(v.requestId) || v.requestId !== v.requestId.toLowerCase() || !selectedIds(v.objectIds)) return null;
  if (v.scope === 'material-exit-progress/1' && v.objectIds.includes(v.requestId)) return null;
  const keys = ['action','scope','requestId','tripId','objectIds'];
  if (v.action === 'preview') return exact(v, keys) ? v as MaterialCommand : null;
  if (v.action === 'export' || v.action === 'erase') return exact(v, [...keys,'previewDigest','confirmed']) && hash(v.previewDigest) && v.confirmed === true ? v as MaterialCommand : null;
  if (v.action !== 'recover' || recovering || !exact(v, [...keys,'mutationBytes']) || typeof v.mutationBytes !== 'string'
    || Buffer.byteLength(v.mutationBytes, 'utf8') > 8192) return null;
  let prior: unknown; try { prior = JSON.parse(v.mutationBytes); } catch { return null; }
  const mutation = parseMaterialCommand(prior, true);
  return mutation?.action === 'erase' && mutation.scope === v.scope && mutation.requestId === v.requestId && mutation.tripId === v.tripId
    && JSON.stringify(mutation.objectIds) === JSON.stringify(v.objectIds) ? v as MaterialCommand : null;
}

/** Explicit coverage exclusions remain in every preview, export and erasure receipt. */
export const MATERIAL_BOUNDARIES = {
  'reservation-reference-data/1': {
    exportFields: ['current_reference','reference_events','reference_operation_metadata'],
    eraseFields: ['selected_current_reference','selected_reference_events','selected_reference_operations'],
    retained: ['nonreplayable_object_operation_fences','original_trip_content','financial_records'],
    missing: ['original_local_material_bytes','external_order_copies','external_order_cancel_refund','provider_verification'],
  },
  'pdf-intake-data/1': {
    exportFields: ['live_corrected_fields','original_locator_hashes','minimal_pdf_operation_metadata'],
    eraseFields: ['temporary_input_bytes','temporary_command_fields','unapplied_pdf_proposal_patch'],
    retained: ['pdf_operation_replay_fences','applied_trip_proposal_history','confirmation_event','financial_records'],
    missing: ['original_pdf_bytes','full_page_text','device_appgroup_copies','external_files','scheduled_target_retention'],
  },
  'material-exit-progress/1': {
    exportFields: ['selected_exit_request_metadata','selected_exit_page_progress','retained_exit_fence_metadata'],
    eraseFields: ['selected_transient_exit_page_progress'],
    retained: ['nonreplayable_request_object_operation_fences','selected_object_ids','request_source_preview_hashes','minimal_erasure_receipt'],
    missing: ['other_unselected_exit_requests'],
  },
} as const;
export type MaterialActor = Readonly<{ ownerId: string; sessionId: string; mobileEpoch: number }>;
export function validMaterialBoundaries(v: unknown, scope: MaterialScope): boolean {
  return record(v) && exact(v, ['exportFields','eraseFields','retained','missing'])
    && Object.entries(MATERIAL_BOUNDARIES[scope]).every(([k, values]) => JSON.stringify(v[k]) === JSON.stringify(values));
}
export const materialBindingKeys = ['schemaVersion','scope','requestId','tripId','objectIds','ownerId','sessionId','mobileEpoch','sourceDigest','previewDigest','capturedAt','expiresAt','tripVersion','boundaries','allUserDataCompleted'] as const;
export type MaterialBinding = MaterialSelection & MaterialActor & Readonly<{
  schemaVersion: typeof MATERIAL_SCHEMA; sourceDigest: string; previewDigest: string;
  capturedAt: number; expiresAt: number; tripVersion: number;
  boundaries: typeof MATERIAL_BOUNDARIES[MaterialScope]; allUserDataCompleted: false;
}>;
export function validMaterialBinding(v: Record<string, unknown>, now: number, allowExpired = false): v is Record<string, unknown> & MaterialBinding {
  return v.schemaVersion === MATERIAL_SCHEMA && materialScope(v.scope) && [v.requestId,v.tripId,v.ownerId,v.sessionId].every(uuid)
    && selectedIds(v.objectIds) && positive(v.mobileEpoch) && hash(v.sourceDigest) && hash(v.previewDigest)
    && positive(v.capturedAt) && positive(v.expiresAt) && v.capturedAt <= now && v.expiresAt > v.capturedAt && (allowExpired || v.expiresAt > now)
    && v.expiresAt <= v.capturedAt + MATERIAL_LIMITS.lifetimeMs && natural(v.tripVersion)
    && validMaterialBoundaries(v.boundaries, v.scope) && v.allUserDataCompleted === false;
}
export function sameMaterialSelection(v: Record<string, unknown>, selection: MaterialSelection, actor: MaterialActor): boolean {
  return v.scope === selection.scope && v.requestId === selection.requestId && v.tripId === selection.tripId
    && JSON.stringify(v.objectIds) === JSON.stringify(selection.objectIds) && v.ownerId === actor.ownerId
    && v.sessionId === actor.sessionId && v.mobileEpoch === actor.mobileEpoch;
}
