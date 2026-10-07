import { createHash } from 'node:crypto';
import { exact, record, hash, uuid } from '../../guide/contract.ts';

export const RESULT_SCHEMA = 'result-data/1' as const;
export const RESULT_TYPES = ['change-proposal-reference/1', 'comparison/1', 'decision/1', 'journey-draft/1', 'practical/1'] as const;
export const RESULT_SCOPES = ['result-sensitive-data/1', 'result-delete-progress/1'] as const;
export type ResultScope = typeof RESULT_SCOPES[number];
export const RESULT_LIMITS = { lifetimeMs: 30000, maxBytes: 1000000, entities: 4100, tableRows: 10000, selected: 20, list: 20, authorities: 100 } as const;
export const resultDigest = (bytes: string) => createHash('sha256').update(bytes, 'utf8').digest('hex');
export const natural = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export const positive = (v: unknown): v is number => natural(v) && v > 0;
export const identifier = (v: unknown): v is string => uuid(v) && v === v.toLowerCase();
export const sortedIds = (v: unknown, maximum: number = RESULT_LIMITS.entities): v is string[] => Array.isArray(v)
  && v.length <= maximum && v.every((id, i) => identifier(id) && (i === 0 || id > v[i - 1]));
export const resultScope = (v: unknown): v is ResultScope => RESULT_SCOPES.includes(v as ResultScope);
export type ResultActor = Readonly<{ ownerId: string; sessionId: string; mobileEpoch: number }>;
export type SourceAuthority = Readonly<{ policyId: string; consentId: string }>;
/** Exact original pairs. No caller-selected or replacement authority. */
export function validSourceAuthorities(v: unknown): v is readonly SourceAuthority[] {
  return Array.isArray(v) && v.length <= RESULT_LIMITS.authorities && v.every((entry, i) => record(entry)
    && exact(entry, ['policyId', 'consentId']) && identifier(entry.policyId) && identifier(entry.consentId)
    && (i === 0 || v[i - 1].policyId < entry.policyId || v[i - 1].policyId === entry.policyId && v[i - 1].consentId < entry.consentId));
}
export type ResultSelection = Readonly<{ scope: ResultScope; requestId: string; rootKind: 'artifact' | null; rootId: string | null; objectIds: readonly string[] }>;
export type ResultCommand =
  | Readonly<{ action: 'list'; scope: ResultScope; rootKind: 'artifact' | null; cursor: Readonly<{ sourceDigest: string; afterId: string }> | null; limit: 20 }>
  | ResultSelection & Readonly<{ action: 'preview' }>
  | ResultSelection & Readonly<{ action: 'erase'; sourceDigest: string; previewDigest: string; confirmed: true }>
  | ResultSelection & Readonly<{ action: 'recover'; mutationBytes: string }>;
export const selectionKeys = ['scope', 'requestId', 'rootKind', 'rootId', 'objectIds'] as const;
export function validSelection(v: Record<string, unknown>): boolean {
  if (!resultScope(v.scope) || !identifier(v.requestId)) return false;
  return v.scope === 'result-sensitive-data/1'
    ? v.rootKind === 'artifact' && identifier(v.rootId) && Array.isArray(v.objectIds) && v.objectIds.length === 0
    : v.rootKind === null && v.rootId === null && sortedIds(v.objectIds, RESULT_LIMITS.selected) && v.objectIds.length > 0 && !v.objectIds.includes(v.requestId);
}
export function parseResultCommand(v: unknown, recovering = false): ResultCommand | null {
  if (!record(v) || !resultScope(v.scope)) return null;
  if (v.action === 'list') return exact(v, ['action', 'scope', 'rootKind', 'cursor', 'limit']) && v.limit === 20
    && (v.scope === 'result-sensitive-data/1' ? v.rootKind === 'artifact' : v.rootKind === null)
    && (v.cursor === null || record(v.cursor) && exact(v.cursor, ['sourceDigest', 'afterId']) && hash(v.cursor.sourceDigest) && identifier(v.cursor.afterId)) ? v as ResultCommand : null;
  if (!validSelection(v)) return null;
  if (v.action === 'preview') return exact(v, ['action', ...selectionKeys]) ? v as ResultCommand : null;
  if (v.action === 'erase') return exact(v, ['action', ...selectionKeys, 'sourceDigest', 'previewDigest', 'confirmed'])
    && hash(v.sourceDigest) && hash(v.previewDigest) && v.confirmed === true ? v as ResultCommand : null;
  if (v.action !== 'recover' || recovering || !exact(v, ['action', ...selectionKeys, 'mutationBytes'])
    || typeof v.mutationBytes !== 'string' || Buffer.byteLength(v.mutationBytes, 'utf8') > 8192) return null;
  let prior: unknown; try { prior = JSON.parse(v.mutationBytes); } catch { return null; }
  const command = parseResultCommand(prior, true);
  return command?.action === 'erase' && sameSelection(v, command) ? v as ResultCommand : null;
}
export function sameSelection(v: Record<string, unknown>, command: ResultSelection): boolean {
  return selectionKeys.every(k => JSON.stringify(v[k]) === JSON.stringify(command[k]));
}
export const GRAPH_UUID_KEYS = ['artifactIds', 'executionIds', 'journalIds', 'publicationKeys'] as const;
export const GRAPH_KEYS = [...GRAPH_UUID_KEYS, 'revisions', 'eventIds'] as const;
export type ResultGraph = Readonly<Record<typeof GRAPH_UUID_KEYS[number], readonly string[]> & { revisions: readonly number[]; eventIds: readonly string[] }>;
export const eventId = (v: unknown): v is string => typeof v === 'string' && /^[1-9][0-9]{0,18}$/.test(v) && BigInt(v) <= BigInt('9223372036854775807');
export function validGraph(v: unknown): v is ResultGraph {
  return record(v) && exact(v, [...GRAPH_KEYS]) && GRAPH_UUID_KEYS.every(k => sortedIds(v[k]))
    && Array.isArray(v.revisions) && v.revisions.length <= 1000 && v.revisions.every((r, i, array) => positive(r) && r <= 1000 && (i === 0 || r > array[i - 1]))
    && Array.isArray(v.eventIds) && v.eventIds.length <= 3000 && v.eventIds.every((e, i, array) => eventId(e) && (i === 0 || BigInt(e) > BigInt(array[i - 1])))
    && GRAPH_KEYS.reduce((n, k) => n + (v[k] as unknown[]).length, 0) <= RESULT_LIMITS.entities;
}
export const REFERENCE_KEYS = ['conversationIds', 'goalIds', 'messageIds', 'taskIds', 'turnIds', 'threadIds', 'tripIds', 'memoryIds', 'sourceArtifactIds', 'proposalIds'] as const;
export type ResultReferences = Readonly<Record<typeof REFERENCE_KEYS[number], readonly string[]>>;
export function validReferences(v: unknown): v is ResultReferences {
  return record(v) && exact(v, [...REFERENCE_KEYS]) && REFERENCE_KEYS.every(k => sortedIds(v[k]))
    && REFERENCE_KEYS.reduce((n, k) => n + (v[k] as string[]).length, 0) <= RESULT_LIMITS.entities;
}
export const ERASED_KEYS = ['artifacts', 'revisions', 'resultEvents', 'executionRuns', 'callWindows', 'collectorOrigins', 'collectorOutputs', 'resultClaims', 'completionProofs', 'completedReceipts', 'localJournals'] as const;
export const RETAINED_KEYS = ['conversations', 'goals', 'messages', 'tasks', 'turns', 'threads', 'trips', 'memories', 'sourceArtifacts', 'proposals', 'budgetAttempts', 'planningSources'] as const;
export const CONFLICTS = ['SCOPE_TOO_LARGE', 'ACTIVE_WORK', 'SHARED_OR_FOREIGN_SCOPE', 'CROSS_RESULT_REFERENCE', 'CONVERSATION_SOURCE_REFERENCE', 'PROPOSAL_REFERENCE', 'DECISION_REFERENCE',
  'READINESS_REFERENCE', 'GUIDE_REFERENCE', 'SCOPED_EDIT_REFERENCE', 'NOTIFICATION_REFERENCE', 'BRIEF_REFERENCE', 'KNOWLEDGE_MIXED_COPY', 'CORE_EXPORT_COPY', 'OTHER_DELETE_PENDING', 'SOURCE_UNSUPPORTED'] as const;
export const RESULT_BOUNDARIES = {
  'result-sensitive-data/1': {
    eraseFields: ['one_selected_artifact_all_revisions_and_events', 'proven_exclusive_completed_planning_result_copies'],
    retained: ['original_conversations_goals_messages_tasks_turns_threads', 'confirmed_trip_content_history_proposals', 'explicit_memory_profiles_receipts_consents', 'original_source_results_and_evidence', 'financial_budget_dispatch_and_source_records', 'permanent_artifact_publication_execution_journal_and_operation_fences', 'original_source_policy_consent_authority_ids'],
    missing: ['cross_result_or_conversation_source_dependents_rejected', 'applied_or_unapplied_proposal_and_decision_dependencies_rejected', 'active_shared_or_unqualified_copies_rejected', 'brief_guide_notification_knowledge_and_core_export_copies_rejected', 'provider_and_external_copies_not_erased', 'backup_restore_and_old_device_acceptance_unverified'],
  },
  'result-delete-progress/1': {
    eraseFields: ['selected_transient_preview_graph_counts_references_conflicts'],
    retained: ['selection_actor_epoch_hash_time_operation_fences', 'immutable_minimal_decisions_and_identity_tombstones', 'original_source_policy_consent_authority_ids'],
    missing: ['source_results_not_erased', 'unselected_operations', 'external_copies', 'backup_restore_and_old_device_acceptance_unverified'],
  },
} as const;
export function validBoundaries(v: unknown, scope: ResultScope): boolean {
  return record(v) && exact(v, ['eraseFields', 'retained', 'missing'])
    && Object.entries(RESULT_BOUNDARIES[scope]).every(([k, values]) => JSON.stringify(v[k]) === JSON.stringify(values));
}
export const bindingKeys = ['schemaVersion', ...selectionKeys, 'ownerId', 'sessionId', 'mobileEpoch', 'sourceDigest', 'previewDigest', 'sourceAuthorities', 'capturedAt', 'expiresAt', 'boundaries', 'allUserDataCompleted'] as const;
export type ResultBinding = ResultSelection & ResultActor & Readonly<{ schemaVersion: typeof RESULT_SCHEMA; sourceDigest: string; previewDigest: string; sourceAuthorities: readonly SourceAuthority[]; capturedAt: number; expiresAt: number; boundaries: typeof RESULT_BOUNDARIES[ResultScope]; allUserDataCompleted: false }>;
export function validBinding(v: Record<string, unknown>, now: number, decided = false): v is Record<string, unknown> & ResultBinding {
  return v.schemaVersion === RESULT_SCHEMA && validSelection(v) && identifier(v.ownerId) && identifier(v.sessionId) && positive(v.mobileEpoch)
    && hash(v.sourceDigest) && hash(v.previewDigest) && validSourceAuthorities(v.sourceAuthorities)
    && (v.scope !== 'result-sensitive-data/1' || v.sourceAuthorities.length > 0)
    && positive(v.capturedAt) && v.capturedAt <= now && positive(v.expiresAt)
    && v.expiresAt === v.capturedAt + RESULT_LIMITS.lifetimeMs && (decided || now < v.expiresAt)
    && validBoundaries(v.boundaries, v.scope as ResultScope) && v.allUserDataCompleted === false;
}
export const counts = (v: unknown, keys: readonly string[]): v is Record<string, number> => record(v) && exact(v, [...keys])
  && keys.every(k => natural(v[k]) && v[k] <= RESULT_LIMITS.tableRows);
