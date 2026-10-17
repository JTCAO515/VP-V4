import {validTripPrivacyOperationRow} from '../../service-task-trip/privacy.ts';
import {TRIP_PRIVATE_SOURCE_KEYS} from '../../service-task-trip/privacy-contract.ts';
import {validTripObjectiveExport} from '../../service-task-trip/export.ts';
import { createHash } from 'node:crypto';
import schema from './source-schema.json' with { type: 'json' };
import { DIRECTION_TURN_SOURCE_SCHEMA, validDirectionTurnExportRow } from '../../planning/directions/turn-export-rows.ts';
const originalSchema=schema.filter(s=>!('tripOnly' in s&&s.tripOnly));
const exportSchema=[...originalSchema,...DIRECTION_TURN_SOURCE_SCHEMA];
const tripExportSchema=[...originalSchema.map(s=>s.relation==='turn_private.service_tasks'?{...s,columns:[...s.columns,{name:'trip_objective',type:'jsonb',notNull:false}]}:s),...schema.filter(s=>'tripOnly' in s&&s.tripOnly),...DIRECTION_TURN_SOURCE_SCHEMA];
import { exact, record, hash } from '../../guide/contract.ts';
import { exportCanonical, type ExportHandler, type ExportLease, type ExportModuleReceipt, type ExportPage } from '../export-dispatcher.ts';
import type { ExportDomainRPC } from '../export-worker.ts';
import { identifier, positive, validSourceAuthorities, validPlaceRequestProof, validPlaceAnswerBasis, ERASED_KEYS, TURN_LIMITS } from './contract.ts';
import { validOperationRow } from './protocol.ts';

export const TURN_EXPORT_SCHEMA = 'turn-core-export/1' as const;
export const TURN_EXPORT_SECTIONS = ['snapshot'] as const;
export const TURN_SOURCE_SCHEMA = exportSchema;
export const TRIP_TURN_SOURCE_SCHEMA=tripExportSchema;
const instant = (v: unknown): v is string => typeof v === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
/** Original JSON columns are data only. Bound every recursive walk, including imported source bytes. */
function jsonValue(v: unknown, depth = 0): boolean {
  if (depth > 32) return false;
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return true;
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.length <= TURN_LIMITS.tableRows && v.every(x => jsonValue(x, depth + 1));
  return record(v) && Object.keys(v).length <= TURN_LIMITS.tableRows && Object.values(v).every(x => jsonValue(x, depth + 1));
}
function columnValue(v: unknown, type: string, required: boolean): boolean {
  if (v === null) return !required;
  switch (type) {
    case 'uuid': return identifier(v);
    case 'text': return typeof v === 'string';
    case 'boolean': return typeof v === 'boolean';
    case 'integer': return typeof v === 'number' && Number.isSafeInteger(v) && v >= -2147483648 && v <= 2147483647;
    // SQL emits exact decimal strings; no lossy PostgreSQL bigint -> JS Number conversion.
    case 'bigint': return typeof v === 'string' && v.length <= 20 && /^(?:0|-[1-9][0-9]*|[1-9][0-9]*)$/.test(v)
      && BigInt(v) >= BigInt('-9223372036854775808') && BigInt(v) <= BigInt('9223372036854775807');
    case 'xid8': return typeof v === 'string' && v.length <= 20 && /^(?:0|[1-9][0-9]*)$/.test(v) && BigInt(v) <= BigInt('18446744073709551615');
    case 'timestamp with time zone': return instant(v);
    case 'jsonb': return jsonValue(v);
    default: return false;
  }
}
function increasing(row: Record<string, unknown>, prior: Record<string, unknown>, spec: Pick<typeof schema[number], 'pk' | 'columns'>): boolean {
  for (const key of spec.pk) {
    const type = spec.columns.find(c => c.name === key)?.type, a = prior[key], b = row[key];
    if (a === b) continue;
    if (type === 'bigint' || type === 'xid8') return BigInt(String(b)) > BigInt(String(a));
    if (type === 'integer') return Number(b) > Number(a);
    return typeof a === 'string' && typeof b === 'string' && b > a;
  }
  return false;
}
type Sources = Map<string, Record<string, unknown>[]>;
/** Every ownerless row must resolve to this snapshot's qualified actual parent, never a guessed task. */
function closedSourceGraph(sources: Sources,tripTask=false): boolean {
  const exportSchema=tripTask?tripExportSchema:TURN_SOURCE_SCHEMA;
  const rows = (table: string) => sources.get(table) ?? [];
  const ids = (table: string, key: string) => new Set(rows(table).map(r => String(r[key])));
  const turns = new Set([...ids('public.turns', 'id'), ...ids('turn_private.text_content', 'turn_id')]);
  const tasks = ids('turn_private.service_tasks', 'id'), messages = ids('turn_private.assistant_messages', 'id');
  const artifacts = ids('turn_private.result_artifacts', 'id'), executions = ids('turn_private.planning_v2_execution_runs', 'id');
  // Only selected Place ancestry uses this stricter graph. Legacy exports keep
  // their original rules. A Task's chain must terminate at its actual goal Turn.
  const taskLinks = new Map(rows('turn_private.service_task_turns').map(r => [r.turn_id,r]));
  const sourceTurns = new Map(rows('public.turns').map(r => [r.id,r]));
  const sourceTexts = new Map(rows('turn_private.text_content').map(r => [r.turn_id,r]));
  const checkedLineage = new Set<string>();
  function placeLineage(first: Record<string,unknown>, task: Record<string,unknown>): boolean {
    let id = first.turn_id;
    const seen = new Set<unknown>(), path: string[] = [];
    for (;;) {
      const key = `${task.id}:${id}`;
      if (checkedLineage.has(key)) break;
      if (seen.has(id)) return false;
      seen.add(id);
      const link = taskLinks.get(id), turn = sourceTurns.get(id), text = sourceTexts.get(id);
      if (!link || !turn || !text || link.task_id !== task.id || link.owner_id !== task.owner_id
        || turn.owner_id !== task.owner_id || text.owner_id !== task.owner_id
        || turn.thread_id !== task.thread_id || text.thread_id !== task.thread_id
        || text.policy_id !== task.policy_id || text.consent_id !== task.consent_id) return false;
      path.push(key);
      if (link.relationship === 'new_goal') {
        if (link.parent_turn_id !== null || id !== task.goal_turn_id) return false;
        break;
      }
      if (!['clarification','repair'].includes(String(link.relationship)) || !identifier(link.parent_turn_id)) return false;
      id = link.parent_turn_id;
    }
    for (const key of path) checkedLineage.add(key);
    return true;
  }
  const linkedMessages = new Set([...rows('turn_private.service_tasks').flatMap(t=>validTripObjectiveExport(t,rows)?rows('turn_private.assistant_messages').filter(m=>m.task_id===t.id&&m.owner_id===t.owner_id&&(record(t.trip_objective)&&t.trip_objective.outcome==='erased'?m.goal_id===(t.trip_objective as Record<string,unknown>).goalId:m.id===(t.trip_objective as Record<string,unknown>)?.messageId)).map(m=>String(m.id)):[]),...rows('turn_private.planning_comparisons').map(r => String(r.message_id)),
    ...rows('turn_private.result_artifacts').map(r => String(r.input_message_id)),
    ...rows('turn_private.assistant_directions_intakes_v1').map(r => String(r.message_id))]);
  for (const spec of exportSchema) for (const row of rows(spec.relation)) {
    if (spec.relation === 'turn_private.directions_operations_v1' && row.erased === true) continue;
    if ('turn_id' in row && row.turn_id !== null && !turns.has(String(row.turn_id))) return false;
    if ('task_turn_id' in row && !turns.has(String(row.task_turn_id))) return false;
    if ('task_id' in row && row.task_id !== null && !tasks.has(String(row.task_id))
      && !(spec.relation === 'public.model_budget_attempts' && turns.has(String(row.task_id)))) return false;
    if ('message_id' in row && !messages.has(String(row.message_id))) return false;
    if ('artifact_id' in row && !artifacts.has(String(row.artifact_id))) return false;
    if ('execution_id' in row && !executions.has(String(row.execution_id))) return false;
    if (spec.relation === 'turn_private.directions_operations_v1' && !messages.has(String(row.source_message_id))) return false;
    if (spec.relation === 'turn_private.directions_result_sources_v1' && (!rows('turn_private.assistant_directions_intakes_v1').some(intake => intake.message_id === row.message_id && intake.task_turn_id === row.task_turn_id)
      || row.previous_artifact_id !== null && !artifacts.has(String(row.previous_artifact_id)))) return false;
    if (spec.relation === 'turn_private.service_tasks' && (!turns.has(String(row.goal_turn_id)) || !turns.has(String(row.last_turn_id)) || (tripTask?!validTripObjectiveExport(row,rows):Object.hasOwn(row,'trip_objective')))) return false;
    if (spec.relation === 'turn_private.grounded_turns' && Object.hasOwn(row,'selected_place_request')) {
      const p = row.selected_place_request;
      if (!validPlaceRequestProof(p,row) || !validPlaceAnswerBasis(row.basis) || !record(p) || !record(p.originalReceipt)) return false;
      const receipt=p.originalReceipt;
      const task=rows('turn_private.service_tasks').find(t=>t.id===row.task_id && t.owner_id===row.owner_id);
      const text=rows('turn_private.text_content').find(t=>t.turn_id===row.turn_id && t.owner_id===row.owner_id);
      const turn=rows('public.turns').find(t=>t.id===row.turn_id && t.owner_id===row.owner_id);
      const link=rows('turn_private.service_task_turns').find(t=>t.turn_id===row.turn_id && t.task_id===row.task_id && t.owner_id===row.owner_id);
      if (!task || !text || !turn || !link || task.thread_id!==p.scopeId || text.thread_id!==p.scopeId || turn.thread_id!==p.scopeId
        || task.policy_id!==text.policy_id || task.consent_id!==text.consent_id || link.relationship!==receipt.relationship
        || link.parent_turn_id!==receipt.parentTurnId || row.scope_version!==receipt.scopeVersion || task.scope_version!==receipt.scopeVersion
        || link.idempotency_key!==p.operationId || text.locale!==row.locale || !placeLineage(link,task)) return false;
    }
    if (spec.relation === 'turn_private.service_task_turns' && row.parent_turn_id !== null && !turns.has(String(row.parent_turn_id))) return false;
    // Planning's real submitter binds a follow_up message with turn_id=NULL.
    // Outbound parent IDs are retained identities; SQL qualifies their owner, never exports their body by guess.
    if (spec.relation === 'turn_private.assistant_messages' && row.turn_id === null && !linkedMessages.has(String(row.id))) return false;
    if (spec.relation === 'turn_private.result_artifacts' && (!messages.has(String(row.input_message_id))
      || row.source_turn_id !== null && !turns.has(String(row.source_turn_id)) || row.source_result_id !== null && !artifacts.has(String(row.source_result_id)))) return false;
  }
  return true;
}
export function decodeTurnExportPage(v: unknown, limit: number, owner: string, now: number, tripTask=false): (ExportPage & { sourceDigest: string }) | null {
  const place = record(v) && v.schemaVersion === 'turn-core-export/3';
  let exportSchema=tripTask?tripExportSchema:TURN_SOURCE_SCHEMA;
  if (!identifier(owner) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isFinite(now)
    || !record(v) || !exact(v, ['schemaVersion', 'section', 'sourceDigest', 'items', 'hasMore', 'nextCursor', 'sectionComplete'])
    || (!place && v.schemaVersion !== (tripTask?'turn-trip-core-export/1':TURN_EXPORT_SCHEMA)) || v.section !== 'snapshot' || !hash(v.sourceDigest) || !Array.isArray(v.items) || v.items.length !== 1
    || v.hasMore !== false || v.nextCursor !== null || v.sectionComplete !== true || Buffer.byteLength(JSON.stringify(v), 'utf8') > TURN_LIMITS.maxBytes) return null;
  const item = v.items[0];
  if (place) {
    if (!record(item) || !Array.isArray(item.sources)) return null;
    // Inventory is exact and complete; a mixed snapshot never filters Trip rows.
    tripTask = item.sources.length === tripExportSchema.length;
    exportSchema = tripTask ? tripExportSchema : TURN_SOURCE_SCHEMA;
  }
  if (!record(item) || !exact(item, ['ownerId', 'sources', 'operations', 'fences', 'sourceIdentityKeys', 'sourceRows', 'sourceAuthorities']) || item.ownerId !== owner
    || !validSourceAuthorities(item.sourceAuthorities)
    || !Array.isArray(item.sources) || item.sources.length !== exportSchema.length || !Array.isArray(item.operations) || !Array.isArray(item.fences)
    || !Array.isArray(item.sourceIdentityKeys) || item.sourceIdentityKeys.length > TURN_LIMITS.tableRows
    || item.operations.length > TURN_LIMITS.tableRows || item.fences.length > TURN_LIMITS.tableRows || !record(item.sourceRows)
    || !exact(item.sourceRows, ['data', 'operations', 'fences', 'sourceIdentityKeys']) || item.sourceRows.operations !== item.operations.length
    || item.sourceRows.fences !== item.fences.length || item.sourceRows.sourceIdentityKeys !== item.sourceIdentityKeys.length) return null;
  const sources: Sources = new Map(); let dataRows = 0, placeRows = 0;
  for (const [index, spec] of exportSchema.entries()) {
    const group = item.sources[index];
    if (!record(group) || !exact(group, ['relation', 'rows']) || group.relation !== spec.relation || !Array.isArray(group.rows) || group.rows.length > TURN_LIMITS.tableRows) return null;
    let previous: Record<string, unknown> | null = null;
    for (const row of group.rows) {
      const extra = place && spec.relation === 'turn_private.grounded_turns' && record(row) && Object.hasOwn(row,'selected_place_request');
      const columns = extra ? [...spec.columns,...(schema.find(s=>s.relation==='turn_private.grounded_turns')?.placeOnlyColumns ?? [])] : spec.columns;
      if (extra) placeRows++;
      if (!record(row) || !exact(row, columns.map(c => c.name)) || !columns.every(c => columnValue(row[c.name], c.type, c.notNull))
        || spec.hasOwner && row.owner_id !== owner || previous && !increasing(row, previous, spec)) return null;
      if (DIRECTION_TURN_SOURCE_SCHEMA.some(s => s.relation === spec.relation) && !validDirectionTurnExportRow(spec.relation, row)) return null;
      previous = row;
    }
    dataRows += group.rows.length; if (dataRows > TURN_LIMITS.tableRows) return null;
    sources.set(spec.relation, group.rows);
  }
  if(place && placeRows === 0) return null;
  if(!tripTask&&(sources.get('turn_private.service_tasks')??[]).some(t=>t.expected_result==='trip_modification'))return null;
  if (item.sourceRows.data !== dataRows || dataRows + item.operations.length + item.fences.length + item.sourceIdentityKeys.length > TURN_LIMITS.tableRows || !closedSourceGraph(sources,tripTask)) return null;
  const authorityPairs = new Set<string>();
  for (const group of sources.values()) for (const row of group) {
    for (const [policyKey, consentKey] of [['policy_id', 'consent_id'], ['planning_policy_id', 'planning_consent_id']])
      if (policyKey in row && consentKey in row) authorityPairs.add(`${row[policyKey]}:${row[consentKey]}`);
  }
  let previousOperation = ''; const terminalSensitiveOperations = new Map<string, Record<string, number>>();
  for (const operation of item.operations) {
    if (!record(operation) || !identifier(operation.requestId) || operation.requestId <= previousOperation || !(tripTask?validTripPrivacyOperationRow(operation,owner,now):validOperationRow(operation, owner, now))) return null;
    previousOperation = operation.requestId;
    if (operation.scope === 'turn-sensitive-data/1' && operation.state === 'erased') {
      const decision = operation.decision as { erasedCounts: Record<string, number> };
      terminalSensitiveOperations.set(operation.requestId, decision.erasedCounts);
    }
    for (const pair of operation.sourceAuthorities as { policyId: string; consentId: string }[]) authorityPairs.add(`${pair.policyId}:${pair.consentId}`);
  }
  if (JSON.stringify([...authorityPairs].sort()) !== JSON.stringify(item.sourceAuthorities.map(pair => `${pair.policyId}:${pair.consentId}`))) return null;
  let previousFence = '';
  for (const fence of item.fences) {
    if (!record(fence) || !exact(fence, ['kind', 'objectId', 'requestId', 'createdAt']) || !['turn', 'message', 'artifact', 'operation'].includes(String(fence.kind))
      || !identifier(fence.objectId) || !identifier(fence.requestId) || !positive(fence.createdAt) || fence.createdAt > now) return null;
    const key = `${fence.kind}:${fence.objectId}`; if (key <= previousFence) return null; previousFence = key;
  }
  let previousIdentity: { requestId: string; relation: string; pk: Record<string, unknown> } | null = null;
  const identityCounts = new Map<string, Record<string, number>>();
  for (const identity of item.sourceIdentityKeys) {
    if (!record(identity) || !exact(identity, ['requestId', 'relation', 'pk']) || !identifier(identity.requestId)
      || !terminalSensitiveOperations.has(identity.requestId) || typeof identity.relation !== 'string' || !record(identity.pk)) return null;
    const originalCounts=terminalSensitiveOperations.get(identity.requestId)!;
    const tripOperation=TRIP_PRIVATE_SOURCE_KEYS.every(k=>Object.hasOwn(originalCounts,k));
    const spec = (tripOperation?schema:originalSchema).find(s => s.relation === identity.relation && s.effect === 'erase');
    const pk = identity.pk;
    if (!spec || !exact(pk, spec.pk) || 'owner_id' in pk && pk.owner_id !== owner || !spec.pk.every(key => {
      const column = spec.columns.find(c => c.name === key);
      return !!column && columnValue(pk[key], column.type, true);
    })) return null;
    if (previousIdentity && (identity.requestId < previousIdentity.requestId
      || identity.requestId === previousIdentity.requestId && (identity.relation < previousIdentity.relation
        || identity.relation === previousIdentity.relation && !increasing(pk, previousIdentity.pk, spec)))) return null;
    const actual = identityCounts.get(identity.requestId) ?? Object.fromEntries([...ERASED_KEYS,...(tripOperation?TRIP_PRIVATE_SOURCE_KEYS:[])].map(k => [k, 0]));
    if(!Object.hasOwn(actual,spec.countKey))return null;
    actual[spec.countKey]++; identityCounts.set(identity.requestId, actual);
    previousIdentity = { requestId: identity.requestId, relation: identity.relation, pk };
  }
  // One immutable key per actual erased source row; omission cannot be disguised by a matching empty counter.
  for (const [requestId, erased] of terminalSensitiveOperations)
    if (!(TRIP_PRIVATE_SOURCE_KEYS.every(k=>Object.hasOwn(erased,k))?[...ERASED_KEYS,...TRIP_PRIVATE_SOURCE_KEYS]:ERASED_KEYS).every(k => (identityCounts.get(requestId)?.[k] ?? 0) === erased[k])) return null;
  return { items: structuredClone(v.items), sourceDigest: v.sourceDigest, hasMore: false, nextCursor: null, sectionComplete: true };
}
export type TurnExportHandler = ExportHandler & { progress(): { pages: number; rows: number; terminalSections: number }; matchesReceipt(receipt: ExportModuleReceipt | undefined): boolean };
/** SQL owns the immutable lease/source qualification at original D2 commit and private download. */
export function turnExportHandler(lease: ExportLease, domain: ExportDomainRPC, now: () => number = Date.now): TurnExportHandler {
  if (![lease.requestId, lease.ownerId, lease.leaseId].every(identifier) || !Number.isSafeInteger(lease.generation) || lease.generation < 1) throw Error('Turn export unavailable');
  let captured: { encoded: string; sourceDigest: string; limit: number } | null = null;
  return {
    sections: TURN_EXPORT_SECTIONS, consistency: 'snapshot',
    progress: () => ({ pages: captured ? 1 : 0, rows: captured ? 1 : 0, terminalSections: captured ? 1 : 0 }),
    matchesReceipt: receipt => !!receipt && receipt.module === 'turn' && (captured
      ? receipt.pages === 1 && receipt.rows === 1 && receipt.status === 'complete' && receipt.reason === 'NONE' && receipt.digest === captured.sourceDigest
      : receipt.pages === 0 && receipt.rows === 0 && receipt.status !== 'complete' && receipt.reason !== 'NONE'),
    page: async (section, cursor, limit, signal) => {
      if (section !== 'snapshot' || cursor !== null || !Number.isSafeInteger(limit) || limit < 1 || limit > 100 || signal.aborted || captured && captured.limit !== limit) throw Error('Turn export unavailable');
      const v = await domain('turn_page', { requestId: lease.requestId, leaseId: lease.leaseId, generation: lease.generation, section, cursor, limit }, signal);
      const decoded = decodeTurnExportPage(v, limit, lease.ownerId, now(),record(v)&&v.schemaVersion==='turn-trip-core-export/1');
      if (!decoded || signal.aborted) throw Error('Turn export unavailable');
      const encoded = exportCanonical({ snapshot: decoded.items }), sourceDigest = createHash('sha256').update(encoded, 'utf8').digest('hex');
      if (sourceDigest !== decoded.sourceDigest || captured && captured.encoded !== encoded) throw Error('Turn export unavailable');
      captured = { encoded, sourceDigest, limit };
      return { items: decoded.items, hasMore: false, nextCursor: null, sectionComplete: true };
    },
  };
}
