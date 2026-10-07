import { exact, record, hash } from '../../guide/contract.ts';
import { natural, counts as conversationCounts } from '../conversation-data/contract.ts';
import { TURN_SCHEMA, TURN_LIMITS, bindingKeys, selectionKeys, GRAPH_KEYS, REFERENCE_KEYS, ERASED_KEYS, REDACTED_KEYS, RETAINED_KEYS, CONFLICTS,
  identifier, positive, sortedIds, turnScope, validSelection, sameSelection, validBinding, validSourceAuthorities,
  type TurnActor, type TurnCommand, type TurnBinding, type TurnGraph } from './contract.ts';

type Selected = Exclude<TurnCommand, { action: 'list' }>;
const size = (v: unknown) => Buffer.byteLength(JSON.stringify(v) ?? '', 'utf8') <= TURN_LIMITS.maxBytes;
const counts = conversationCounts;
const actorMatches = (v: Record<string, unknown>, a: TurnActor) => v.ownerId === a.ownerId && v.sessionId === a.sessionId && v.mobileEpoch === a.mobileEpoch;
const bound = (v: Record<string, unknown>, c: Selected, a: TurnActor) => actorMatches(v, a) && sameSelection(v, c)
  && (c.action !== 'erase' || v.previewDigest === c.previewDigest && v.sourceDigest === c.sourceDigest);
export function validGraph(v: unknown): v is TurnGraph {
  return record(v) && exact(v, [...GRAPH_KEYS]) && GRAPH_KEYS.every(k => sortedIds(v[k]))
    && GRAPH_KEYS.reduce((n, k) => n + (v[k] as string[]).length, 0) <= TURN_LIMITS.entities;
}
const refs = (v: unknown): v is Record<typeof REFERENCE_KEYS[number], string[]> => record(v) && exact(v, [...REFERENCE_KEYS]) && REFERENCE_KEYS.every(k => sortedIds(v[k]));
const conflicts = (v: unknown): v is string[] => Array.isArray(v) && v.length <= CONFLICTS.length && v.every((s, i) => typeof s === 'string' && CONFLICTS.includes(s as typeof CONFLICTS[number])
  && (i === 0 || CONFLICTS.indexOf(v[i - 1]) < CONFLICTS.indexOf(s as typeof CONFLICTS[number])));
const emptyGraph = (v: TurnGraph) => GRAPH_KEYS.every(k => v[k].length === 0);
function graphRoot(graph: TurnGraph, v: Record<string, unknown>): boolean {
  return v.scope === 'turn-delete-progress/1' ? emptyGraph(graph) : graph.turnIds.length === 1 && graph.turnIds[0] === v.turnId;
}
function cardinalities(graph: TurnGraph, erase: Record<string, number>, redact: Record<string, number>, retain: Record<string, number>): boolean {
  return retain.turns === graph.turnIds.length && retain.messages === graph.messageIds.length && redact.messageBodies === graph.messageIds.length
    && erase.artifacts === graph.artifactIds.length && redact.textBodies === 1 && redact.taskDigests <= retain.tasks;
}
const totalRows = (erase: Record<string, number>, redact: Record<string, number>, retain: Record<string, number>) =>
  [...Object.values(erase), ...Object.values(retain), redact.textBodies].reduce((n, count) => n + count, 0);
function validEffects(v: Record<string, unknown>, graph: TurnGraph, erase: Record<string, number>, redact: Record<string, number>, retain: Record<string, number>): boolean {
  return v.scope === 'turn-delete-progress/1' ? emptyGraph(graph) && [...Object.values(erase), ...Object.values(redact), ...Object.values(retain)].every(n => n === 0)
    : graphRoot(graph, v) && cardinalities(graph, erase, redact, retain) && totalRows(erase, redact, retain) <= TURN_LIMITS.entities;
}
export function decodeTurnPreview(v: unknown, c: Selected, a: TurnActor, now: number): Record<string, unknown> | null {
  if (!record(v) || !exact(v, [...bindingKeys, 'kind', 'graph', 'eraseCounts', 'redactCounts', 'retainCounts', 'retainedReferences', 'conflicts', 'eligible', 'progressCount'])
    || !validBinding(v, now) || !bound(v, c, a) || v.kind !== 'preview' || !validGraph(v.graph)
    || !counts(v.eraseCounts, ERASED_KEYS) || !counts(v.redactCounts, REDACTED_KEYS) || !counts(v.retainCounts, RETAINED_KEYS)
    || !refs(v.retainedReferences) || !conflicts(v.conflicts) || v.eligible !== (v.conflicts.length === 0) || !natural(v.progressCount) || !size(v)) return null;
  if (v.eligible && (!validEffects(v, v.graph, v.eraseCounts, v.redactCounts, v.retainCounts)
    || v.retainCounts.tasks !== v.retainedReferences.taskIds.length || v.retainCounts.threads !== v.retainedReferences.threadIds.length
    || v.retainCounts.conversations !== v.retainedReferences.conversationIds.length || v.retainCounts.goals !== v.retainedReferences.goalIds.length)) return null;
  const references = v.retainedReferences;
  if (v.scope === 'turn-sensitive-data/1' ? v.progressCount !== 0 : v.progressCount !== c.objectIds.length || !emptyGraph(v.graph)
    || REFERENCE_KEYS.some(k => references[k].length > 0)
    || !validEffects(v, v.graph, v.eraseCounts, v.redactCounts, v.retainCounts)) return null;
  return v;
}
export type TurnDecision = Readonly<{ requestDigest: string; decidedAt: number; graph: TurnGraph; erasedCounts: Record<string, number>;
  redactedCounts: Record<string, number>; retainedCounts: Record<string, number>; clearedPreviews: number; retainedFences: number;
  sourceTurn: 'erased' | 'not_modified'; parentData: 'not_modified' | 'selected_digest_redacted'; sourceTrip: 'not_modified'; explicitMemory: 'not_modified'; financialData: 'not_modified'; externalCopies: 'not_erased' }>;
export type TurnReceipt = TurnBinding & Readonly<{ kind: 'receipt'; state: 'erased'; decision: TurnDecision }>;
export function validDecision(v: unknown, selection: Record<string, unknown>, capturedAt: number, expiresAt: number, now: number, selectedCount: number): v is TurnDecision {
  if (!record(v) || !exact(v, ['requestDigest', 'decidedAt', 'graph', 'erasedCounts', 'redactedCounts', 'retainedCounts', 'clearedPreviews', 'retainedFences', 'sourceTurn', 'parentData', 'sourceTrip', 'explicitMemory', 'financialData', 'externalCopies'])
    || !hash(v.requestDigest) || !positive(v.decidedAt) || v.decidedAt < capturedAt || v.decidedAt >= expiresAt || v.decidedAt > now
    || !validGraph(v.graph) || !counts(v.erasedCounts, ERASED_KEYS) || !counts(v.redactedCounts, REDACTED_KEYS) || !counts(v.retainedCounts, RETAINED_KEYS)
    || !natural(v.clearedPreviews) || !natural(v.retainedFences) || v.parentData !== (v.redactedCounts.taskDigests > 0 ? 'selected_digest_redacted' : 'not_modified') || v.sourceTrip !== 'not_modified'
    || v.explicitMemory !== 'not_modified' || v.financialData !== 'not_modified' || v.externalCopies !== 'not_erased'
    || !validEffects(selection, v.graph, v.erasedCounts, v.redactedCounts, v.retainedCounts)) return false;
  const graph = v.graph;
  return selection.scope === 'turn-sensitive-data/1' ? v.sourceTurn === 'erased' && v.clearedPreviews === 0
    && v.retainedFences === GRAPH_KEYS.reduce((n, k) => n + graph[k].length, 0)
    : v.sourceTurn === 'not_modified' && v.clearedPreviews <= selectedCount && v.retainedFences === selectedCount;
}
export function decodeTurnReceipt(v: unknown, c: Selected, a: TurnActor, digest: string, now: number): TurnReceipt | null {
  return record(v) && exact(v, [...bindingKeys, 'kind', 'state', 'decision']) && validBinding(v, now, true) && bound(v, c, a)
    && v.kind === 'receipt' && v.state === 'erased' && validDecision(v.decision, v, v.capturedAt, v.expiresAt, now, c.objectIds.length)
    && v.decision.requestDigest === digest && size(v) ? v as TurnReceipt : null;
}
export function decodeTurnUnknown(v: unknown, c: Selected, a: TurnActor, digest: string): boolean {
  return record(v) && exact(v, ['schemaVersion', 'kind', ...selectionKeys, 'ownerId', 'sessionId', 'mobileEpoch', 'requestDigest', 'allUserDataCompleted'])
    && v.schemaVersion === TURN_SCHEMA && v.kind === 'unknown' && actorMatches(v, a) && sameSelection(v, c) && v.requestDigest === digest && v.allUserDataCompleted === false && size(v);
}
/** Finite own progress. No original input/output or recursively embedded receipts. */
export function validOperationRow(v: unknown, owner: string, now: number): boolean {
  if (!record(v) || !exact(v, ['requestId', 'ownerId', 'sessionId', 'mobileEpoch', 'scope', 'turnId', 'objectIds', 'sourceDigest', 'previewDigest',
    'sourceAuthorities', 'capturedAt', 'expiresAt', 'requestDigest', 'state', 'previewErased', 'graph', 'eraseCounts', 'redactCounts', 'retainCounts', 'retainedReferences', 'conflicts', 'decision'])
    || !validSelection(v) || v.ownerId !== owner || !identifier(v.sessionId) || !positive(v.mobileEpoch) || !hash(v.sourceDigest) || !hash(v.previewDigest)
    || !positive(v.capturedAt) || v.capturedAt > now || v.expiresAt !== v.capturedAt + TURN_LIMITS.lifetimeMs || !validSourceAuthorities(v.sourceAuthorities)
    || v.scope === 'turn-sensitive-data/1' && v.sourceAuthorities.length === 0 || !['previewed', 'erased'].includes(String(v.state)) || typeof v.previewErased !== 'boolean') return false;
  if (v.previewErased ? [v.graph, v.eraseCounts, v.redactCounts, v.retainCounts, v.retainedReferences, v.conflicts].some(x => x !== null)
    : !validGraph(v.graph) || !counts(v.eraseCounts, ERASED_KEYS) || !counts(v.redactCounts, REDACTED_KEYS) || !counts(v.retainCounts, RETAINED_KEYS)
      || !refs(v.retainedReferences) || !conflicts(v.conflicts)) return false;
  if (!v.previewErased && Array.isArray(v.conflicts) && v.conflicts.length === 0 && (!validGraph(v.graph) || !counts(v.eraseCounts, ERASED_KEYS)
    || !counts(v.redactCounts, REDACTED_KEYS) || !counts(v.retainCounts, RETAINED_KEYS) || !validEffects(v, v.graph, v.eraseCounts, v.redactCounts, v.retainCounts))) return false;
  return v.state === 'previewed' ? v.requestDigest === null && v.decision === null
    : hash(v.requestDigest) && validDecision(v.decision, v, v.capturedAt, Number(v.expiresAt), now, (v.objectIds as string[]).length)
      && v.decision.requestDigest === v.requestDigest && v.previewErased === true;
}
export function decodeTurnList(v: unknown, c: Extract<TurnCommand, { action: 'list' }>, a: TurnActor, now: number): Record<string, unknown> | null {
  if (!record(v) || !exact(v, ['schemaVersion', 'kind', 'scope', 'ownerId', 'sessionId', 'mobileEpoch', 'sourceDigest', 'capturedAt', 'expiresAt', 'items', 'hasMore', 'nextCursor', 'allUserDataCompleted'])
    || v.schemaVersion !== TURN_SCHEMA || v.kind !== 'list' || !turnScope(v.scope) || v.scope !== c.scope || !actorMatches(v, a) || !hash(v.sourceDigest)
    || !positive(v.capturedAt) || v.capturedAt > now || v.expiresAt !== v.capturedAt + TURN_LIMITS.lifetimeMs || Number(v.expiresAt) <= now
    || c.cursor && c.cursor.sourceDigest !== v.sourceDigest || !Array.isArray(v.items) || v.items.length > 20 || typeof v.hasMore !== 'boolean' || v.allUserDataCompleted !== false || !size(v)) return null;
  let last = c.cursor?.afterId ?? '';
  for (const item of v.items) {
    if (!record(item)) return null;
    const id = v.scope === 'turn-sensitive-data/1' ? item.turnId : item.requestId;
    if (!identifier(id) || id <= last) return null;
    if (v.scope === 'turn-sensitive-data/1' ? !exact(item, ['turnId', 'threadId', 'taskId', 'createdAt', 'status', 'erased']) || !identifier(item.threadId)
      || item.taskId !== null && !identifier(item.taskId) || !positive(item.createdAt) || item.createdAt > now || item.status !== 'completed' || typeof item.erased !== 'boolean'
      : !validOperationRow(item, a.ownerId, now)) return null;
    last = id;
  }
  if (v.hasMore ? v.items.length !== 20 || !record(v.nextCursor) || !exact(v.nextCursor, ['sourceDigest', 'afterId']) || v.nextCursor.sourceDigest !== v.sourceDigest || v.nextCursor.afterId !== last : v.nextCursor !== null) return null;
  return v;
}
