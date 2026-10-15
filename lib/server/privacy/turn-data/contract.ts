import { validExpectation, parseRecoveryKey, sameId } from "../../knowledge/place-ask/contract.ts";
import {TRIP_PRIVATE_SOURCE_KEYS,TRIP_OBJECTIVE_REDACTION_KEY} from '../../service-task-trip/privacy-contract.ts';
import { createHash } from 'node:crypto';
import { exact, record, hash } from '../../guide/contract.ts';
import { identifier, positive, sortedIds, validSourceAuthorities, type SourceAuthority } from '../conversation-data/contract.ts';

export { identifier, positive, sortedIds, validSourceAuthorities };
export const TURN_SCHEMA = 'turn-data/1' as const;
export const TURN_SCOPES = ['turn-sensitive-data/1', 'turn-delete-progress/1'] as const;
export type TurnScope = typeof TURN_SCOPES[number];
export const TURN_LIMITS = { lifetimeMs: 30000, maxBytes: 1000000, entities: 4100, tableRows: 10000, selected: 20, list: 20 } as const;
export type TurnActor = Readonly<{ ownerId: string; sessionId: string; mobileEpoch: number }>;
export const turnDigest = (bytes: string) => createHash('sha256').update(bytes, 'utf8').digest('hex');
export const turnScope = (v: unknown): v is TurnScope => TURN_SCOPES.includes(v as TurnScope);
export type TurnSelection = Readonly<{ scope: TurnScope; requestId: string; turnId: string | null; objectIds: readonly string[] }>;
export type TurnCommand =
  | Readonly<{ action: 'list'; scope: TurnScope; cursor: Readonly<{ sourceDigest: string; afterId: string }> | null; limit: 20 }>
  | TurnSelection & Readonly<{ action: 'preview' }>
  | TurnSelection & Readonly<{ action: 'erase'; sourceDigest: string; previewDigest: string; confirmed: true }>
  | TurnSelection & Readonly<{ action: 'recover'; mutationBytes: string }>;
export const selectionKeys = ['scope', 'requestId', 'turnId', 'objectIds'] as const;
export function validSelection(v: Record<string, unknown>): boolean {
  return turnScope(v.scope) && identifier(v.requestId) && (v.scope === 'turn-sensitive-data/1'
    ? identifier(v.turnId) && Array.isArray(v.objectIds) && v.objectIds.length === 0
    : v.turnId === null && sortedIds(v.objectIds, TURN_LIMITS.selected) && v.objectIds.length > 0 && !v.objectIds.includes(v.requestId));
}
export function sameSelection(v: Record<string, unknown>, command: TurnSelection): boolean {
  return selectionKeys.every(k => JSON.stringify(v[k]) === JSON.stringify(command[k]));
}
export function parseTurnCommand(v: unknown, recovering = false): TurnCommand | null {
  if (!record(v) || !turnScope(v.scope)) return null;
  if (v.action === 'list') return exact(v, ['action', 'scope', 'cursor', 'limit']) && v.limit === 20
    && (v.cursor === null || record(v.cursor) && exact(v.cursor, ['sourceDigest', 'afterId']) && hash(v.cursor.sourceDigest) && identifier(v.cursor.afterId)) ? v as TurnCommand : null;
  if (!validSelection(v)) return null;
  if (v.action === 'preview') return exact(v, ['action', ...selectionKeys]) ? v as TurnCommand : null;
  if (v.action === 'erase') return exact(v, ['action', ...selectionKeys, 'sourceDigest', 'previewDigest', 'confirmed'])
    && hash(v.sourceDigest) && hash(v.previewDigest) && v.confirmed === true ? v as TurnCommand : null;
  if (v.action !== 'recover' || recovering || !exact(v, ['action', ...selectionKeys, 'mutationBytes'])
    || typeof v.mutationBytes !== 'string' || Buffer.byteLength(v.mutationBytes, 'utf8') > 8192) return null;
  let prior: unknown; try { prior = JSON.parse(v.mutationBytes); } catch { return null; }
  const command = parseTurnCommand(prior, true);
  return command?.action === 'erase' && sameSelection(v, command) ? v as TurnCommand : null;
}

/** Parent identities are inspectable retention, never a cascade selection. */
export const GRAPH_KEYS = ['turnIds', 'messageIds', 'artifactIds'] as const;
export type TurnGraph = Readonly<Record<typeof GRAPH_KEYS[number], readonly string[]>>;
export const REFERENCE_KEYS = ['taskIds', 'threadIds', 'conversationIds', 'goalIds', 'tripIds', 'memoryIds'] as const;
export const ERASED_KEYS = ['events', 'idempotency', 'feedback', 'artifacts', 'revisions', 'resultEvents', 'sourceReceipts', 'intakes',
  'intakeBindings', 'planning', 'actionReceipts', 'observations', 'modelDispatches', 'checkpoints', 'attemptBindings', 'localJournals',
  'executionRuns', 'callWindows', 'collectorOrigins', 'collectorOutputs', 'resultClaims', 'completionProofs', 'completedReceipts',
  'grounded', 'assistJobs', 'work', 'memoryConsumers'] as const;
export const REDACTED_KEYS = ['textBodies', 'messageBodies', 'taskDigests'] as const;
export const RETAINED_KEYS = ['turns', 'messages', 'tasks', 'taskTurns', 'capacity', 'budgetAttempts', 'textDispatches', 'threads', 'conversations', 'goals'] as const;
export const CONFLICTS = ['SCOPE_TOO_LARGE', 'ACTIVE_WORK', 'SHARED_OR_FOREIGN_SCOPE', 'CROSS_TURN_REFERENCE', 'PROPOSAL_REFERENCE',
  'READINESS_REFERENCE', 'GUIDE_REFERENCE', 'SCOPED_EDIT_REFERENCE', 'NOTIFICATION_REFERENCE', 'BRIEF_REFERENCE', 'CORE_EXPORT_COPY',
  'OTHER_DELETE_PENDING', 'SOURCE_UNSUPPORTED'] as const;
export const TURN_BOUNDARIES = {
  'turn-sensitive-data/1': {
    eraseFields: ['selected_turn_events_feedback_idempotency', 'exclusive_result_revisions_events', 'selected_intakes_source_receipts', 'selected_grounded_planning_worker_sensitive_copies', 'selected_memory_consumer_references'],
    redactFields: ['selected_text_input_output_permanently_hidden', 'selected_message_input_fixed_deleted_marker', 'selected_root_task_digest_fixed_deleted_marker'],
    retained: ['turn_message_task_thread_conversation_goal_identity', 'other_turns_and_parent_contents_except_selected_root_task_digest', 'confirmed_trip_content_history_proposals', 'explicit_memory_profiles_receipts_consents', 'capacity_budget_dispatch_financial_metadata', 'permanent_identity_operation_fences', 'original_policy_consent_authority_ids'],
    missing: ['active_shared_cross_turn_and_mixed_result_references_blocked', 'guide_brief_proposal_knowledge_source_references_require_original_flow', 'mixed_core_export_copies_require_original_cleanup', 'provider_external_copies_not_erased', 'backup_restore_old_device_acceptance_unverified'],
  },
  'turn-delete-progress/1': {
    eraseFields: ['selected_transient_preview_graph_counts_references_conflicts'], redactFields: [],
    retained: ['original_selection_actor_epoch_hash_time_operation_fences', 'immutable_minimal_decisions', 'original_policy_consent_authority_ids'],
    missing: ['source_turn_data_not_erased', 'unselected_operations', 'external_copies', 'backup_restore_old_device_acceptance_unverified'],
  },
} as const;
export const bindingKeys = ['schemaVersion', ...selectionKeys, 'ownerId', 'sessionId', 'mobileEpoch', 'sourceDigest', 'previewDigest', 'sourceAuthorities', 'capturedAt', 'expiresAt', 'boundaries', 'allUserDataCompleted'] as const;
export type TurnBinding = TurnSelection & TurnActor & Readonly<{ schemaVersion: typeof TURN_SCHEMA; sourceDigest: string; previewDigest: string;
  sourceAuthorities: readonly SourceAuthority[]; capturedAt: number; expiresAt: number; boundaries: typeof TURN_BOUNDARIES[TurnScope]; allUserDataCompleted: false }>;
export function validBinding(v: Record<string, unknown>, now: number, decided = false): v is Record<string, unknown> & TurnBinding {
  const boundaries = v.boundaries;
  return v.schemaVersion === TURN_SCHEMA && validSelection(v) && identifier(v.ownerId) && identifier(v.sessionId) && positive(v.mobileEpoch)
    && hash(v.sourceDigest) && hash(v.previewDigest) && validSourceAuthorities(v.sourceAuthorities)
    && (v.scope !== 'turn-sensitive-data/1' || v.sourceAuthorities.length > 0)
    && positive(v.capturedAt) && v.capturedAt <= now && positive(v.expiresAt) && v.expiresAt === v.capturedAt + TURN_LIMITS.lifetimeMs
    && (decided || now < v.expiresAt) && record(boundaries) && exact(boundaries, ['eraseFields', 'redactFields', 'retained', 'missing'])
    && Object.entries(TURN_BOUNDARIES[v.scope as TurnScope]).every(([k, values]) => JSON.stringify(boundaries[k]) === JSON.stringify(values))
    && v.allUserDataCompleted === false;
}

/** Explicit Trip privacy version only; original v1 count vectors are unchanged. */
export const TRIP_ERASED_KEYS=[...ERASED_KEYS,...TRIP_PRIVATE_SOURCE_KEYS] as const;
export const TRIP_REDACTED_KEYS=[...REDACTED_KEYS,TRIP_OBJECTIVE_REDACTION_KEY] as const;

/** Stored original admission evidence; never fresh authority to dispatch. */
export function validPlaceRequestProof(v: unknown, row: Record<string, unknown>): boolean {
  if (!record(v) || !exact(v, ['schemaVersion','operationId','scopeKind','scopeId','operation','requestDigest','expectation','basis','originalReceipt'])
    || v.schemaVersion !== 'canonical-place-proof/1' || !identifier(v.operationId) || v.scopeKind !== 'thread' || !identifier(v.scopeId)
    || !hash(v.requestDigest) || !validExpectation(v.expectation) || !record(v.basis) || !record(v.originalReceipt)) return false;
  const op = parseRecoveryKey(v.operation), b = v.basis, r = v.originalReceipt;
  return !!op && op.scopeKind === 'thread' && sameId(op.operationId,v.operationId) && sameId(op.scopeId,v.scopeId) && sameId(op.turnId,row.turn_id)
    && exact(b,['subjectId','city','scene','sourceDigest']) && typeof b.subjectId === 'string' && [...b.subjectId].length >= 1 && [...b.subjectId].length <= 160
    && ['shanghai','beijing','guangzhou','chongqing'].includes(String(b.city)) && b.city === row.city
    && typeof b.scene === 'string' && [...b.scene].length >= 1 && [...b.scene].length <= 80 && hash(b.sourceDigest)
    && v.expectation.locale === row.locale && exact(r,['version','kind','turnId','reused','serviceTaskId','scopeVersion','relationship','parentTurnId'])
    && r.version === 2 && r.kind === 'accepted' && r.reused === false && sameId(r.turnId,row.turn_id) && sameId(r.serviceTaskId,row.task_id)
    && r.scopeVersion === 1 && ['new_goal','clarification','repair'].includes(String(r.relationship))
    && (r.parentTurnId === null || identifier(r.parentTurnId)) && (r.relationship === 'new_goal') === (r.parentTurnId === null);
}
export function validPlaceAnswerBasis(v: unknown): boolean {
  if (v === null) return true;
  if (!record(v) || !exact(v,['publications','claims']) || !Array.isArray(v.publications) || v.publications.length > 50 || !Array.isArray(v.claims) || v.claims.length > 6) return false;
  if (!v.publications.every(p => record(p) && exact(p,['factId','assertionId','revision','payloadHash']) && identifier(p.factId) && identifier(p.assertionId)
    && Number.isSafeInteger(p.revision) && Number(p.revision) >= 1 && Number(p.revision) <= 2147483647 && hash(p.payloadHash))) return false;
  const facts = new Set(v.publications.map(p => p.factId));
  return v.claims.every(c => record(c) && exact(c,['id','status','reasons','factIds']) && ['place_address','opening_hours'].includes(String(c.id))
    && ['covered','unavailable','unresolved_variants'].includes(String(c.status)) && Array.isArray(c.reasons) && c.reasons.length <= 8
    && c.reasons.every(r => ['missing','expired','revoked','unreviewed','unresolved_variants'].includes(String(r)) && typeof r === 'string')
    && Array.isArray(c.factIds) && c.factIds.length <= 50 && c.factIds.every(f => identifier(f) && facts.has(f)));
}
