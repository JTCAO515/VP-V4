import { createHash } from 'node:crypto';
import { exact, record, hash, uuid } from '../../guide/contract.ts';

export const PROFILE_SCHEMA = 'profile-data/1' as const;
export const PROFILE_SCOPES = ['profile-sensitive-data/1', 'profile-delete-progress/1'] as const;
export type ProfileScope = typeof PROFILE_SCOPES[number];
export const PROFILE_LIMITS = { lifetimeMs: 30000, maxBytes: 1000000, rows: 10000, selected: 20, list: 20 } as const;
export const profileDigest = (bytes: string) => createHash('sha256').update(bytes, 'utf8').digest('hex');
export const natural = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export const positive = (v: unknown): v is number => natural(v) && v > 0;
export const revision = (v: unknown): v is number => natural(v) && v <= 9007199254740990;
export const identifier = (v: unknown): v is string => uuid(v) && v === v.toLowerCase();
export const sortedIds = (v: unknown, cap: number = PROFILE_LIMITS.rows): v is string[] => Array.isArray(v) && v.length <= cap
  && v.every((x, i) => identifier(x) && (i === 0 || v[i - 1] < x));
export type ProfileActor = Readonly<{ ownerId: string; sessionId: string; mobileEpoch: number }>;
export type ProfileSelection = Readonly<{ scope: ProfileScope; requestId: string; profileId: string | null; objectIds: readonly string[] }>;
export type ProfileCommand =
  | Readonly<{ action: 'list'; scope: ProfileScope; cursor: Readonly<{ sourceDigest: string; afterId: string }> | null; limit: 20 }>
  | ProfileSelection & Readonly<{ action: 'preview' }>
  | ProfileSelection & Readonly<{ action: 'erase'; sourceDigest: string; previewDigest: string; confirmed: true }>
  | ProfileSelection & Readonly<{ action: 'recover'; mutationBytes: string }>;
export const selectionKeys = ['scope', 'requestId', 'profileId', 'objectIds'] as const;
export const profileScope = (v: unknown): v is ProfileScope => PROFILE_SCOPES.includes(v as ProfileScope);
export function validSelection(v: Record<string, unknown>): boolean {
  return profileScope(v.scope) && identifier(v.requestId) && (v.scope === 'profile-sensitive-data/1'
    ? identifier(v.profileId) && Array.isArray(v.objectIds) && v.objectIds.length === 0
    : v.profileId === null && sortedIds(v.objectIds, PROFILE_LIMITS.selected) && v.objectIds.length > 0 && !v.objectIds.includes(v.requestId));
}
export function sameSelection(v: Record<string, unknown>, c: ProfileSelection): boolean {
  return selectionKeys.every(k => JSON.stringify(v[k]) === JSON.stringify(c[k]));
}
export function parseProfileCommand(v: unknown, recovering = false): ProfileCommand | null {
  if (!record(v) || !profileScope(v.scope)) return null;
  if (v.action === 'list') return exact(v, ['action', 'scope', 'cursor', 'limit']) && v.limit === 20
    && (v.cursor === null || record(v.cursor) && exact(v.cursor, ['sourceDigest', 'afterId']) && hash(v.cursor.sourceDigest) && identifier(v.cursor.afterId)) ? v as ProfileCommand : null;
  if (!validSelection(v)) return null;
  if (v.action === 'preview') return exact(v, ['action', ...selectionKeys]) ? v as ProfileCommand : null;
  if (v.action === 'erase') return exact(v, ['action', ...selectionKeys, 'sourceDigest', 'previewDigest', 'confirmed'])
    && hash(v.sourceDigest) && hash(v.previewDigest) && v.confirmed === true ? v as ProfileCommand : null;
  if (v.action !== 'recover' || recovering || !exact(v, ['action', ...selectionKeys, 'mutationBytes'])
    || typeof v.mutationBytes !== 'string' || Buffer.byteLength(v.mutationBytes, 'utf8') > 8192) return null;
  let prior: unknown; try { prior = JSON.parse(v.mutationBytes); } catch { return null; }
  const c = parseProfileCommand(prior, true);
  return c?.action === 'erase' && sameSelection(v, c) ? v as ProfileCommand : null;
}
export const PROFILE_FIELDS = ['display_name', 'travel_pace', 'locale', 'currency', 'distance_unit', 'temperature_unit', 'default_departure_time',
  'pace_notice', 'pace_operation', 'pace_request', 'pace_undo'] as const;
export const COPY_KEYS = ['briefPreviews', 'sharedBriefs', 'scopedEditContexts', 'scopedEditWork', 'recoveryContexts', 'coreExports'] as const;
export const CONFLICTS = ['SCOPE_TOO_LARGE', 'ACTIVE_PROFILE_USE', 'CORE_EXPORT_COPY', 'OTHER_DELETE_PENDING', 'SOURCE_UNSUPPORTED'] as const;
export const PROFILE_BOUNDARIES = {
  'profile-sensitive-data/1': {
    eraseFields: [...PROFILE_FIELDS],
    retained: ['account_auth_sessions', 'profile_owner_identity_created_at_monotonic_revisions', 'system_fallbacks_without_pace_consent',
      'explicit_memory_trip_history_financial_provider_and_other_modules', 'mixed_domain_copies_under_original_controls', 'immutable_minimal_decisions_operation_replay_fences'],
    missing: ['external_provider_downloaded_export_backup_and_old_device_copies_not_recalled', 'mixed_domain_copies_not_cascade_erased', 'target_backup_and_old_device_acceptance_unverified'],
  },
  'profile-delete-progress/1': {
    eraseFields: ['selected_transient_preview_counts_conflicts_copy_references'],
    retained: ['actor_selection_hash_time_operation_fences', 'immutable_minimal_decisions', 'profile_owner_identity_monotonic_revision_erasure_floor'],
    missing: ['profile_source_not_modified', 'unselected_progress', 'external_copies', 'target_backup_and_old_device_acceptance_unverified'],
  },
} as const;
export function validBoundaries(v: unknown, scope: ProfileScope): boolean {
  return record(v) && exact(v, ['eraseFields', 'retained', 'missing'])
    && Object.entries(PROFILE_BOUNDARIES[scope]).every(([k, expected]) => JSON.stringify(v[k]) === JSON.stringify(expected));
}
export const bindingKeys = ['schemaVersion', ...selectionKeys, 'ownerId', 'sessionId', 'mobileEpoch', 'sourceDigest', 'previewDigest',
  'capturedAt', 'expiresAt', 'boundaries', 'allUserDataCompleted'] as const;
export type ProfileBinding = ProfileSelection & ProfileActor & Readonly<{ schemaVersion: typeof PROFILE_SCHEMA; sourceDigest: string; previewDigest: string;
  capturedAt: number; expiresAt: number; boundaries: typeof PROFILE_BOUNDARIES[ProfileScope]; allUserDataCompleted: false }>;
export function validBinding(v: Record<string, unknown>, now: number, decided = false): v is Record<string, unknown> & ProfileBinding {
  return v.schemaVersion === PROFILE_SCHEMA && validSelection(v) && identifier(v.ownerId) && identifier(v.sessionId) && positive(v.mobileEpoch)
    && (v.scope !== 'profile-sensitive-data/1' || v.profileId === v.ownerId) && hash(v.sourceDigest) && hash(v.previewDigest)
    && positive(v.capturedAt) && v.capturedAt <= now && v.expiresAt === v.capturedAt + PROFILE_LIMITS.lifetimeMs && (decided || Number(v.expiresAt) > now)
    && validBoundaries(v.boundaries, v.scope as ProfileScope) && v.allUserDataCompleted === false;
}
