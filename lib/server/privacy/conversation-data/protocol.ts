import { exact, record, hash } from '../../guide/contract.ts';
import { CONVERSATION_SCHEMA, CONVERSATION_LIMITS, bindingKeys, selectionKeys, GRAPH_KEYS, ERASED_KEYS, REDACTED_KEYS, RETAINED_KEYS, CONFLICTS,
  identifier, natural, positive, sortedIds, conversationScope, validSelection, sameSelection, validBinding, validGraph, counts,
  type ConversationActor, type ConversationCommand, type ConversationBinding, type ConversationGraph } from './contract.ts';

type Selected = Exclude<ConversationCommand, { action: 'list' }>;
export type ConversationDecision = Readonly<{ requestDigest: string; decidedAt: number; graph: ConversationGraph;
  erasedCounts: Record<string, number>; redactedCounts: Record<string, number>; retainedCounts: Record<string, number>;
  clearedPreviews: number; retainedFences: number; sourceConversation: 'erased' | 'not_modified'; sourceTrip: 'not_modified'; explicitMemory: 'not_modified'; externalCopies: 'not_erased' }>;
export type ConversationReceipt = ConversationBinding & Readonly<{ kind: 'receipt'; state: 'erased'; decision: ConversationDecision }>;
const size = (v: unknown) => Buffer.byteLength(JSON.stringify(v) ?? '', 'utf8') <= CONVERSATION_LIMITS.maxBytes;
const actorMatches = (v: Record<string, unknown>, a: ConversationActor) => v.ownerId === a.ownerId && v.sessionId === a.sessionId && v.mobileEpoch === a.mobileEpoch;
const bound = (v: Record<string, unknown>, c: Selected, a: ConversationActor) => actorMatches(v, a) && sameSelection(v, c)
  && (c.action !== 'erase' || v.previewDigest === c.previewDigest && v.sourceDigest === c.sourceDigest);
const conflicts = (v: unknown): v is string[] => Array.isArray(v) && v.length <= CONFLICTS.length && v.every((s, i) => typeof s === 'string' && CONFLICTS.includes(s as typeof CONFLICTS[number])
  && (i === 0 || CONFLICTS.indexOf(v[i - 1]) < CONFLICTS.indexOf(s as typeof CONFLICTS[number])));
const refs = (v: unknown): v is { tripIds: string[]; memoryIds: string[] } => record(v) && exact(v, ['tripIds', 'memoryIds']) && sortedIds(v.tripIds) && sortedIds(v.memoryIds);
const emptyGraph = (v: ConversationGraph) => GRAPH_KEYS.every(k => v[k].length === 0);
const totalRows = (erase: Record<string, number>, redact: Record<string, number>, retain: Record<string, number>) =>
  Object.values(erase).reduce((n, count) => n + count, 0) + Object.values(retain).reduce((n, count) => n + count, 0) + redact.textBodies;
function graphRoot(graph: ConversationGraph, v: Record<string, unknown>): boolean {
  if (v.scope === 'conversation-delete-progress/1') return emptyGraph(graph);
  return v.rootKind === 'conversation' ? graph.conversationIds.length === 1 && graph.conversationIds[0] === v.rootId
    : graph.threadIds.length === 1 && graph.threadIds[0] === v.rootId && graph.conversationIds.length === 0 && graph.goalIds.length === 0 && graph.messageIds.length === 0;
}
function cardinalities(graph: ConversationGraph, erase: Record<string, number>, redact: Record<string, number>, retain: Record<string, number>): boolean {
  return erase.conversations === graph.conversationIds.length && erase.goals === graph.goalIds.length && erase.messages === graph.messageIds.length
    && erase.threads === graph.threadIds.length && erase.turns === graph.turnIds.length && erase.artifacts === graph.artifactIds.length
    && redact.taskDigests === graph.taskIds.length && retain.tasks === graph.taskIds.length;
}
export function decodeConversationPreview(v: unknown, c: Selected, a: ConversationActor, now: number): Record<string, unknown> | null {
  if (!record(v) || !exact(v, [...bindingKeys, 'kind', 'graph', 'eraseCounts', 'redactCounts', 'retainCounts', 'retainedReferences', 'conflicts', 'eligible', 'progressCount'])
    || !validBinding(v, now) || !bound(v, c, a) || v.kind !== 'preview' || !validGraph(v.graph)
    || !counts(v.eraseCounts, ERASED_KEYS) || !counts(v.redactCounts, REDACTED_KEYS) || !counts(v.retainCounts, RETAINED_KEYS)
    || !refs(v.retainedReferences) || !conflicts(v.conflicts) || v.eligible !== (v.conflicts.length === 0)
    || !natural(v.progressCount) || !size(v)) return null;
  // Conflict previews may expose only qualified owner entities; overflow has no fabricated selection.
  if (v.eligible && (!graphRoot(v.graph, v) || !cardinalities(v.graph, v.eraseCounts, v.redactCounts, v.retainCounts)
    || totalRows(v.eraseCounts, v.redactCounts, v.retainCounts) > CONVERSATION_LIMITS.entities)) return null;
  if (v.scope === 'conversation-sensitive-data/1' ? v.progressCount !== 0 : v.progressCount !== c.objectIds.length
    || !emptyGraph(v.graph) || (v.retainedReferences.tripIds as string[]).length !== 0 || (v.retainedReferences.memoryIds as string[]).length !== 0
    || [...Object.values(v.eraseCounts), ...Object.values(v.redactCounts), ...Object.values(v.retainCounts)].some(n => n !== 0)) return null;
  return v;
}
export function validDecision(v: unknown, scope: string, capturedAt: number, expiresAt: number, now: number, selectedCount: number): v is ConversationDecision {
  if (!record(v) || !exact(v, ['requestDigest', 'decidedAt', 'graph', 'erasedCounts', 'redactedCounts', 'retainedCounts', 'clearedPreviews', 'retainedFences', 'sourceConversation', 'sourceTrip', 'explicitMemory', 'externalCopies'])
    || !hash(v.requestDigest) || !positive(v.decidedAt) || v.decidedAt < capturedAt || v.decidedAt >= expiresAt || v.decidedAt > now
    || !validGraph(v.graph) || !counts(v.erasedCounts, ERASED_KEYS) || !counts(v.redactedCounts, REDACTED_KEYS) || !counts(v.retainedCounts, RETAINED_KEYS)
    || !natural(v.clearedPreviews) || !natural(v.retainedFences) || v.sourceTrip !== 'not_modified' || v.explicitMemory !== 'not_modified' || v.externalCopies !== 'not_erased') return false;
  const graph = v.graph;
  if (scope === 'conversation-sensitive-data/1') return v.sourceConversation === 'erased' && v.clearedPreviews === 0
    && v.retainedFences === GRAPH_KEYS.reduce((n, k) => n + graph[k].length, 0) && cardinalities(graph, v.erasedCounts, v.redactedCounts, v.retainedCounts)
    && totalRows(v.erasedCounts, v.redactedCounts, v.retainedCounts) <= CONVERSATION_LIMITS.entities;
  return v.sourceConversation === 'not_modified' && v.clearedPreviews <= selectedCount && v.retainedFences === selectedCount && emptyGraph(v.graph)
    && [...Object.values(v.erasedCounts), ...Object.values(v.redactedCounts), ...Object.values(v.retainedCounts)].every(n => n === 0);
}
export function decodeConversationReceipt(v: unknown, c: Selected, a: ConversationActor, digest: string, now: number): ConversationReceipt | null {
  if (!record(v) || !exact(v, [...bindingKeys, 'kind', 'state', 'decision']) || !validBinding(v, now, true) || !bound(v, c, a)
    || v.kind !== 'receipt' || v.state !== 'erased' || !validDecision(v.decision, v.scope, v.capturedAt, v.expiresAt, now, c.objectIds.length)
    || v.decision.requestDigest !== digest || !graphRoot(v.decision.graph, v) || !size(v)) return null;
  return v as ConversationReceipt;
}
export function decodeConversationUnknown(v: unknown, c: Selected, a: ConversationActor, digest: string): boolean {
  return record(v) && exact(v, ['schemaVersion', 'kind', ...selectionKeys, 'ownerId', 'sessionId', 'mobileEpoch', 'requestDigest', 'allUserDataCompleted'])
    && v.schemaVersion === CONVERSATION_SCHEMA && v.kind === 'unknown' && actorMatches(v, a) && sameSelection(v, c)
    && v.requestDigest === digest && v.allUserDataCompleted === false && size(v);
}
/** Every persisted operation field is inspectable; decision is finite and never embeds another receipt. */
export function validOperationRow(v: unknown, owner: string, now: number): boolean {
  if (!record(v) || !exact(v, ['requestId', 'ownerId', 'sessionId', 'mobileEpoch', 'scope', 'rootKind', 'rootId', 'objectIds', 'sourceDigest', 'previewDigest',
    'capturedAt', 'expiresAt', 'requestDigest', 'state', 'previewErased', 'graph', 'eraseCounts', 'redactCounts', 'retainCounts', 'retainedReferences', 'conflicts', 'decision'])
    || !validSelection(v) || v.ownerId !== owner || !identifier(v.sessionId) || !positive(v.mobileEpoch) || !hash(v.sourceDigest) || !hash(v.previewDigest)
    || !positive(v.capturedAt) || v.capturedAt > now || v.expiresAt !== v.capturedAt + CONVERSATION_LIMITS.lifetimeMs
    || (v.state !== 'previewed' && v.state !== 'erased') || typeof v.previewErased !== 'boolean') return false;
  if (v.previewErased ? [v.graph, v.eraseCounts, v.redactCounts, v.retainCounts, v.retainedReferences, v.conflicts].some(x => x !== null)
    : !validGraph(v.graph) || !counts(v.eraseCounts, ERASED_KEYS) || !counts(v.redactCounts, REDACTED_KEYS) || !counts(v.retainCounts, RETAINED_KEYS) || !refs(v.retainedReferences) || !conflicts(v.conflicts)) return false;
  if (!v.previewErased && Array.isArray(v.conflicts) && v.conflicts.length === 0
    && (!validGraph(v.graph) || !counts(v.eraseCounts, ERASED_KEYS) || !counts(v.redactCounts, REDACTED_KEYS) || !counts(v.retainCounts, RETAINED_KEYS)
      || !graphRoot(v.graph, v) || !cardinalities(v.graph, v.eraseCounts, v.redactCounts, v.retainCounts)
      || totalRows(v.eraseCounts, v.redactCounts, v.retainCounts) > CONVERSATION_LIMITS.entities)) return false;
  return v.state === 'previewed' ? v.requestDigest === null && v.decision === null
    : hash(v.requestDigest) && validDecision(v.decision, String(v.scope), v.capturedAt, Number(v.expiresAt), now, (v.objectIds as string[]).length)
      && v.decision.requestDigest === v.requestDigest && graphRoot(v.decision.graph, v) && v.previewErased === true;
}
export function decodeConversationList(v: unknown, c: Extract<ConversationCommand, { action: 'list' }>, a: ConversationActor, now: number): Record<string, unknown> | null {
  if (!record(v) || !exact(v, ['schemaVersion', 'kind', 'scope', 'rootKind', 'ownerId', 'sessionId', 'mobileEpoch', 'sourceDigest', 'capturedAt', 'expiresAt', 'items', 'hasMore', 'nextCursor', 'allUserDataCompleted'])
    || v.schemaVersion !== CONVERSATION_SCHEMA || v.kind !== 'list' || !conversationScope(v.scope) || v.scope !== c.scope || v.rootKind !== c.rootKind || !actorMatches(v, a)
    || !hash(v.sourceDigest) || !positive(v.capturedAt) || v.capturedAt > now || v.expiresAt !== v.capturedAt + CONVERSATION_LIMITS.lifetimeMs || Number(v.expiresAt) <= now
    || c.cursor && c.cursor.sourceDigest !== v.sourceDigest || !Array.isArray(v.items) || v.items.length > 20 || typeof v.hasMore !== 'boolean' || v.allUserDataCompleted !== false || !size(v)) return null;
  let last = c.cursor?.afterId ?? '';
  for (const item of v.items) {
    if (!record(item)) return null;
    const id = v.scope === 'conversation-sensitive-data/1' ? item.rootId : item.requestId;
    if (!identifier(id) || id <= last) return null;
    if (v.scope === 'conversation-sensitive-data/1' ? !exact(item, ['rootKind', 'rootId', 'createdAt']) || item.rootKind !== c.rootKind || !positive(item.createdAt) || item.createdAt > now
      : !validOperationRow(item, a.ownerId, now)) return null;
    last = id;
  }
  if (v.hasMore ? v.items.length !== 20 || !record(v.nextCursor) || !exact(v.nextCursor, ['sourceDigest', 'afterId']) || v.nextCursor.sourceDigest !== v.sourceDigest || v.nextCursor.afterId !== last : v.nextCursor !== null) return null;
  return v;
}
