import { createHash } from 'node:crypto';
import schema from './source-schema.json' with { type: 'json' };
import { exact, record, hash } from '../../guide/contract.ts';
import { exportCanonical, type ExportHandler, type ExportLease, type ExportModuleReceipt, type ExportPage } from '../export-dispatcher.ts';
import type { ExportDomainRPC } from '../export-worker.ts';
import { identifier, positive, validSourceAuthorities, TURN_LIMITS } from './contract.ts';
import { validOperationRow } from './protocol.ts';

export const TURN_EXPORT_SCHEMA = 'turn-core-export/1' as const;
export const TURN_EXPORT_SECTIONS = ['snapshot'] as const;
export const TURN_SOURCE_SCHEMA = schema;
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
    case 'bigint': return typeof v === 'string' && /^(?:0|-[1-9][0-9]*|[1-9][0-9]*)$/.test(v)
      && BigInt(v) >= BigInt('-9223372036854775808') && BigInt(v) <= BigInt('9223372036854775807');
    case 'xid8': return typeof v === 'string' && /^(?:0|[1-9][0-9]*)$/.test(v) && BigInt(v) <= BigInt('18446744073709551615');
    case 'timestamp with time zone': return instant(v);
    case 'jsonb': return jsonValue(v);
    default: return false;
  }
}
function increasing(row: Record<string, unknown>, prior: Record<string, unknown>, spec: typeof schema[number]): boolean {
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
function closedSourceGraph(sources: Sources): boolean {
  const rows = (table: string) => sources.get(table) ?? [];
  const ids = (table: string, key: string) => new Set(rows(table).map(r => String(r[key])));
  const turns = new Set([...ids('public.turns', 'id'), ...ids('turn_private.text_content', 'turn_id')]);
  const tasks = ids('turn_private.service_tasks', 'id'), messages = ids('turn_private.assistant_messages', 'id');
  const artifacts = ids('turn_private.result_artifacts', 'id'), executions = ids('turn_private.planning_v2_execution_runs', 'id');
  const linkedMessages = new Set([...rows('turn_private.planning_comparisons').map(r => String(r.message_id)),
    ...rows('turn_private.result_artifacts').map(r => String(r.input_message_id))]);
  for (const spec of schema) for (const row of rows(spec.relation)) {
    if ('turn_id' in row && row.turn_id !== null && !turns.has(String(row.turn_id))) return false;
    if ('task_turn_id' in row && !turns.has(String(row.task_turn_id))) return false;
    if ('task_id' in row && !tasks.has(String(row.task_id))) return false;
    if ('message_id' in row && !messages.has(String(row.message_id))) return false;
    if ('artifact_id' in row && !artifacts.has(String(row.artifact_id))) return false;
    if ('execution_id' in row && !executions.has(String(row.execution_id))) return false;
    if (spec.relation === 'turn_private.service_tasks' && (!turns.has(String(row.goal_turn_id)) || !turns.has(String(row.last_turn_id)))) return false;
    if (spec.relation === 'turn_private.service_task_turns' && row.parent_turn_id !== null && !turns.has(String(row.parent_turn_id))) return false;
    // Planning's real submitter binds a follow_up message with turn_id=NULL.
    // Outbound parent IDs are retained identities; SQL qualifies their owner, never exports their body by guess.
    if (spec.relation === 'turn_private.assistant_messages' && row.turn_id === null && !linkedMessages.has(String(row.id))) return false;
    if (spec.relation === 'turn_private.result_artifacts' && (!messages.has(String(row.input_message_id))
      || row.source_turn_id !== null && !turns.has(String(row.source_turn_id)) || row.source_result_id !== null && !artifacts.has(String(row.source_result_id)))) return false;
  }
  return true;
}
export function decodeTurnExportPage(v: unknown, limit: number, owner: string, now: number): (ExportPage & { sourceDigest: string }) | null {
  if (!identifier(owner) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isFinite(now)
    || !record(v) || !exact(v, ['schemaVersion', 'section', 'sourceDigest', 'items', 'hasMore', 'nextCursor', 'sectionComplete'])
    || v.schemaVersion !== TURN_EXPORT_SCHEMA || v.section !== 'snapshot' || !hash(v.sourceDigest) || !Array.isArray(v.items) || v.items.length !== 1
    || v.hasMore !== false || v.nextCursor !== null || v.sectionComplete !== true || Buffer.byteLength(JSON.stringify(v), 'utf8') > TURN_LIMITS.maxBytes) return null;
  const item = v.items[0];
  if (!record(item) || !exact(item, ['ownerId', 'sources', 'operations', 'fences', 'sourceRows', 'sourceAuthorities']) || item.ownerId !== owner
    || !validSourceAuthorities(item.sourceAuthorities)
    || !Array.isArray(item.sources) || item.sources.length !== schema.length || !Array.isArray(item.operations) || !Array.isArray(item.fences)
    || item.operations.length > TURN_LIMITS.tableRows || item.fences.length > TURN_LIMITS.tableRows || !record(item.sourceRows)
    || !exact(item.sourceRows, ['data', 'operations', 'fences']) || item.sourceRows.operations !== item.operations.length || item.sourceRows.fences !== item.fences.length) return null;
  const sources: Sources = new Map(); let dataRows = 0;
  for (const [index, spec] of schema.entries()) {
    const group = item.sources[index];
    if (!record(group) || !exact(group, ['relation', 'rows']) || group.relation !== spec.relation || !Array.isArray(group.rows) || group.rows.length > TURN_LIMITS.tableRows) return null;
    let previous: Record<string, unknown> | null = null;
    for (const row of group.rows) {
      if (!record(row) || !exact(row, spec.columns.map(c => c.name)) || !spec.columns.every(c => columnValue(row[c.name], c.type, c.notNull))
        || spec.hasOwner && row.owner_id !== owner || previous && !increasing(row, previous, spec)) return null;
      previous = row;
    }
    dataRows += group.rows.length; if (dataRows > TURN_LIMITS.tableRows) return null;
    sources.set(spec.relation, group.rows);
  }
  if (item.sourceRows.data !== dataRows || dataRows + item.operations.length + item.fences.length > TURN_LIMITS.tableRows || !closedSourceGraph(sources)) return null;
  let previousOperation = '';
  for (const operation of item.operations) {
    if (!record(operation) || !identifier(operation.requestId) || operation.requestId <= previousOperation || !validOperationRow(operation, owner, now)) return null;
    previousOperation = operation.requestId;
  }
  let previousFence = '';
  for (const fence of item.fences) {
    if (!record(fence) || !exact(fence, ['kind', 'objectId', 'requestId', 'createdAt']) || !['turn', 'message', 'artifact', 'operation'].includes(String(fence.kind))
      || !identifier(fence.objectId) || !identifier(fence.requestId) || !positive(fence.createdAt) || fence.createdAt > now) return null;
    const key = `${fence.kind}:${fence.objectId}`; if (key <= previousFence) return null; previousFence = key;
  }
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
      const decoded = decodeTurnExportPage(v, limit, lease.ownerId, now());
      if (!decoded || signal.aborted) throw Error('Turn export unavailable');
      const encoded = exportCanonical({ snapshot: decoded.items }), sourceDigest = createHash('sha256').update(encoded, 'utf8').digest('hex');
      if (sourceDigest !== decoded.sourceDigest || captured && captured.encoded !== encoded) throw Error('Turn export unavailable');
      captured = { encoded, sourceDigest, limit };
      return { items: decoded.items, hasMore: false, nextCursor: null, sectionComplete: true };
    },
  };
}
