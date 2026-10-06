import { createHash } from 'node:crypto';
import { exact, record, hash, uuid } from '../../guide/contract.ts';

export const CONVERSATION_SCHEMA = 'conversation-data/1' as const;
export const CONVERSATION_SCOPES = ['conversation-sensitive-data/1', 'conversation-delete-progress/1'] as const;
export type ConversationScope = typeof CONVERSATION_SCOPES[number];
export const CONVERSATION_LIMITS = { lifetimeMs: 30000, maxBytes: 1000000, entities: 4100, tableRows: 10000, selected: 20, list: 20 } as const;
export const conversationDigest = (bytes: string) => createHash('sha256').update(bytes, 'utf8').digest('hex');
export const natural = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export const positive = (v: unknown): v is number => natural(v) && v > 0;
export const identifier = (v: unknown): v is string => uuid(v) && v === v.toLowerCase();
export const sortedIds = (v: unknown, maximum: number = CONVERSATION_LIMITS.entities): v is string[] => Array.isArray(v)
  && v.length <= maximum && v.every((id, i) => identifier(id) && (i === 0 || id > v[i - 1]));
export const conversationScope = (v: unknown): v is ConversationScope => CONVERSATION_SCOPES.includes(v as ConversationScope);
export type ConversationActor = Readonly<{ ownerId: string; sessionId: string; mobileEpoch: number }>;
export type ConversationSelection = Readonly<{ scope: ConversationScope; requestId: string; rootKind: 'conversation' | 'thread' | null; rootId: string | null; objectIds: readonly string[] }>;
export type ConversationCommand =
  | Readonly<{ action: 'list'; scope: ConversationScope; rootKind: 'conversation' | 'thread' | null; cursor: Readonly<{ sourceDigest: string; afterId: string }> | null; limit: 20 }>
  | ConversationSelection & Readonly<{ action: 'preview' }>
  | ConversationSelection & Readonly<{ action: 'erase'; sourceDigest: string; previewDigest: string; confirmed: true }>
  | ConversationSelection & Readonly<{ action: 'recover'; mutationBytes: string }>;
export const selectionKeys = ['scope', 'requestId', 'rootKind', 'rootId', 'objectIds'] as const;
export function validSelection(v: Record<string, unknown>): boolean {
  if (!conversationScope(v.scope) || !identifier(v.requestId)) return false;
  return v.scope === 'conversation-sensitive-data/1'
    ? (v.rootKind === 'conversation' || v.rootKind === 'thread') && identifier(v.rootId) && Array.isArray(v.objectIds) && v.objectIds.length === 0
    : v.rootKind === null && v.rootId === null && sortedIds(v.objectIds, CONVERSATION_LIMITS.selected) && v.objectIds.length > 0 && !v.objectIds.includes(v.requestId);
}
export function parseConversationCommand(v: unknown, recovering = false): ConversationCommand | null {
  if (!record(v) || !conversationScope(v.scope)) return null;
  if (v.action === 'list') return exact(v, ['action', 'scope', 'rootKind', 'cursor', 'limit']) && v.limit === 20
    && (v.scope === 'conversation-sensitive-data/1' ? v.rootKind === 'conversation' || v.rootKind === 'thread' : v.rootKind === null)
    && (v.cursor === null || record(v.cursor) && exact(v.cursor, ['sourceDigest', 'afterId']) && hash(v.cursor.sourceDigest) && identifier(v.cursor.afterId)) ? v as ConversationCommand : null;
  if (!validSelection(v)) return null;
  if (v.action === 'preview') return exact(v, ['action', ...selectionKeys]) ? v as ConversationCommand : null;
  if (v.action === 'erase') return exact(v, ['action', ...selectionKeys, 'sourceDigest', 'previewDigest', 'confirmed'])
    && hash(v.sourceDigest) && hash(v.previewDigest) && v.confirmed === true ? v as ConversationCommand : null;
  if (v.action !== 'recover' || recovering || !exact(v, ['action', ...selectionKeys, 'mutationBytes'])
    || typeof v.mutationBytes !== 'string' || Buffer.byteLength(v.mutationBytes, 'utf8') > 8192) return null;
  let prior: unknown; try { prior = JSON.parse(v.mutationBytes); } catch { return null; }
  const command = parseConversationCommand(prior, true);
  return command?.action === 'erase' && sameSelection(v, command) ? v as ConversationCommand : null;
}
export function sameSelection(v: Record<string, unknown>, command: ConversationSelection): boolean {
  return selectionKeys.every(k => JSON.stringify(v[k]) === JSON.stringify(command[k]));
}
export const GRAPH_KEYS = ['conversationIds', 'threadIds', 'turnIds', 'taskIds', 'goalIds', 'messageIds', 'artifactIds'] as const;
export type ConversationGraph = Readonly<Record<typeof GRAPH_KEYS[number], readonly string[]>>;
export const ERASED_KEYS = ['conversations', 'goals', 'messages', 'threads', 'turns', 'events', 'idempotency', 'feedback', 'artifacts', 'revisions', 'resultEvents',
  'sourceReceipts', 'intakes', 'intakeBindings', 'planning', 'actionReceipts', 'observations', 'modelDispatches', 'checkpoints', 'attemptBindings', 'localJournals',
  'executionRuns', 'callWindows', 'collectorOrigins', 'collectorOutputs', 'resultClaims', 'completionProofs', 'completedReceipts', 'grounded', 'assistJobs', 'work', 'memoryConsumers', 'goalLinks'] as const;
export const REDACTED_KEYS = ['textBodies', 'taskDigests'] as const;
export const RETAINED_KEYS = ['tasks', 'taskTurns', 'capacity', 'budgetAttempts', 'textDispatches', 'goalTripReceipts'] as const;
export const CONFLICTS = ['SCOPE_TOO_LARGE', 'ACTIVE_WORK', 'SHARED_OR_FOREIGN_SCOPE', 'CROSS_SCOPE_REFERENCE', 'PROPOSAL_REFERENCE',
  'READINESS_REFERENCE', 'GUIDE_REFERENCE', 'SCOPED_EDIT_REFERENCE', 'NOTIFICATION_REFERENCE', 'BRIEF_REFERENCE', 'CORE_EXPORT_COPY', 'OTHER_DELETE_PENDING', 'SOURCE_UNSUPPORTED'] as const;
export const CONVERSATION_BOUNDARIES = {
  'conversation-sensitive-data/1': {
    eraseFields: ['selected_conversation_goals_messages_intakes_source_receipts', 'exclusive_threads_turns_events_feedback', 'exclusive_results_all_revisions_events', 'closed_planning_grounded_worker_copies', 'selected_turn_memory_consumer_references'],
    redactFields: ['selected_private_text_input_output_permanently_hidden', 'selected_task_goal_digest_fixed_deleted_marker'],
    retained: ['confirmed_trip_content_history_proposals', 'explicit_memory_profiles_receipts_consents', 'other_conversations_and_domains', 'minimal_task_capacity_budget_dispatch_link_receipts', 'permanent_entity_identity_and_operation_fences'],
    missing: ['applied_or_unapplied_proposal_source_requires_original_flow', 'shared_cross_scope_or_active_work_rejected', 'readiness_guide_scoped_edit_notification_brief_links_rejected', 'existing_core_export_copies_require_original_cleanup', 'provider_and_external_copies_not_erased', 'backup_restore_and_old_device_acceptance_unverified'],
  },
  'conversation-delete-progress/1': {
    eraseFields: ['selected_transient_preview_graph_conflicts_references'], redactFields: [],
    retained: ['root_selection_actor_epoch_hash_time_operation_fences', 'immutable_minimal_decisions_and_entity_tombstones'],
    missing: ['source_conversation_data_not_erased', 'unselected_operations', 'external_copies', 'backup_restore_and_old_device_acceptance_unverified'],
  },
} as const;
export function validBoundaries(v: unknown, scope: ConversationScope): boolean {
  return record(v) && exact(v, ['eraseFields', 'redactFields', 'retained', 'missing'])
    && Object.entries(CONVERSATION_BOUNDARIES[scope]).every(([k, values]) => JSON.stringify(v[k]) === JSON.stringify(values));
}
export const bindingKeys = ['schemaVersion', ...selectionKeys, 'ownerId', 'sessionId', 'mobileEpoch', 'sourceDigest', 'previewDigest', 'capturedAt', 'expiresAt', 'boundaries', 'allUserDataCompleted'] as const;
export type ConversationBinding = ConversationSelection & ConversationActor & Readonly<{ schemaVersion: typeof CONVERSATION_SCHEMA; sourceDigest: string; previewDigest: string; capturedAt: number; expiresAt: number; boundaries: typeof CONVERSATION_BOUNDARIES[ConversationScope]; allUserDataCompleted: false }>;
export function validBinding(v: Record<string, unknown>, now: number, decided = false): v is Record<string, unknown> & ConversationBinding {
  return v.schemaVersion === CONVERSATION_SCHEMA && validSelection(v) && identifier(v.ownerId) && identifier(v.sessionId) && positive(v.mobileEpoch)
    && hash(v.sourceDigest) && hash(v.previewDigest) && positive(v.capturedAt) && v.capturedAt <= now && positive(v.expiresAt)
    && v.expiresAt === v.capturedAt + CONVERSATION_LIMITS.lifetimeMs && (decided || now < v.expiresAt)
    && validBoundaries(v.boundaries, v.scope as ConversationScope) && v.allUserDataCompleted === false;
}
export const counts = (v: unknown, keys: readonly string[]): v is Record<string, number> => record(v) && exact(v, [...keys])
  && keys.every(k => natural(v[k]) && v[k] <= CONVERSATION_LIMITS.tableRows);
export function validGraph(v: unknown): v is ConversationGraph {
  return record(v) && exact(v, [...GRAPH_KEYS]) && GRAPH_KEYS.every(k => sortedIds(v[k]))
    && GRAPH_KEYS.reduce((n, k) => n + (v[k] as string[]).length, 0) <= CONVERSATION_LIMITS.entities;
}
