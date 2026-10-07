import { exact, record, hash } from '../../guide/contract.ts';
import { RESULT_SCHEMA, RESULT_TYPES, RESULT_LIMITS, bindingKeys, selectionKeys, GRAPH_KEYS, ERASED_KEYS, RETAINED_KEYS, CONFLICTS, REFERENCE_KEYS,
  identifier, natural, positive, resultScope, validSelection, sameSelection, validBinding, validGraph, validReferences, counts, validSourceAuthorities,
  type ResultActor, type ResultCommand, type ResultBinding, type ResultGraph, type ResultReferences } from './contract.ts';

type Selected = Exclude<ResultCommand, { action: 'list' }>;
export type ResultDecision = Readonly<{ requestDigest: string; decidedAt: number; graph: ResultGraph;
  erasedCounts: Record<string, number>; retainedCounts: Record<string, number>; clearedPreviews: number; retainedFences: number;
  sourceResult: 'erased' | 'not_modified'; sourceConversation: 'not_modified'; sourceTrip: 'not_modified'; explicitMemory: 'not_modified'; externalCopies: 'not_erased' }>;
export type ResultReceipt = ResultBinding & Readonly<{ kind: 'receipt'; state: 'erased'; decision: ResultDecision }>;
export const emptyResultGraph = (): ResultGraph => ({ artifactIds: [], executionIds: [], journalIds: [], publicationKeys: [], revisions: [], eventIds: [] });
const size = (v: unknown) => Buffer.byteLength(JSON.stringify(v) ?? '', 'utf8') <= RESULT_LIMITS.maxBytes;
const actorMatches = (v: Record<string, unknown>, a: ResultActor) => v.ownerId === a.ownerId && v.sessionId === a.sessionId && v.mobileEpoch === a.mobileEpoch;
const bound = (v: Record<string, unknown>, c: Selected, a: ResultActor) => actorMatches(v, a) && sameSelection(v, c)
  && (c.action !== 'erase' || v.previewDigest === c.previewDigest && v.sourceDigest === c.sourceDigest);
const conflicts = (v: unknown): v is string[] => Array.isArray(v) && v.length <= CONFLICTS.length && v.every((s, i) => typeof s === 'string' && CONFLICTS.includes(s as typeof CONFLICTS[number])
  && (i === 0 || CONFLICTS.indexOf(v[i - 1]) < CONFLICTS.indexOf(s as typeof CONFLICTS[number])));
const emptyGraph = (v: ResultGraph) => GRAPH_KEYS.every(k => v[k].length === 0);
const zero = (v: Record<string, number>) => Object.values(v).every(n => n === 0);
const totalRows = (erase: Record<string, number>, retain: Record<string, number>) => Object.values(erase).reduce((n, count) => n + count, 0) + Object.values(retain).reduce((n, count) => n + count, 0);
export const fenceCount = (graph: ResultGraph) => graph.artifactIds.length + graph.publicationKeys.length + graph.executionIds.length + graph.journalIds.length;
function graphRoot(graph: ResultGraph, v: Record<string, unknown>): boolean {
  return v.scope === 'result-delete-progress/1' ? emptyGraph(graph)
    : graph.artifactIds.length === 1 && graph.artifactIds[0] === v.rootId && graph.revisions.length > 0
      && graph.revisions.every((r, i) => r === i + 1) && graph.publicationKeys.length === graph.revisions.length && graph.eventIds.length >= graph.revisions.length;
}
function cardinalities(graph: ResultGraph, erase: Record<string, number>, retain: Record<string, number>): boolean {
  return erase.artifacts === graph.artifactIds.length && erase.revisions === graph.revisions.length && erase.resultEvents === graph.eventIds.length
    && erase.executionRuns === graph.executionIds.length && erase.completionProofs === graph.executionIds.length && erase.completedReceipts === graph.executionIds.length
    && erase.localJournals === graph.journalIds.length && graph.executionIds.length <= 1 && graph.journalIds.length <= 1
    && ['callWindows', 'collectorOrigins', 'collectorOutputs', 'resultClaims'].every(k => erase[k] === graph.executionIds.length)
    && retain.budgetAttempts >= graph.executionIds.length && (graph.executionIds.length + graph.journalIds.length === 0 || retain.planningSources > 0)
    && totalRows(erase, retain) <= RESULT_LIMITS.entities
    && (graph.artifactIds.length === 0 || retain.conversations === 1 && retain.goals === 1 && retain.messages === 1 && retain.tasks === 1 && retain.turns > 0);
}
function referencesMatch(refs: ResultReferences, retain: Record<string, number>): boolean {
  const keys = ['conversations', 'goals', 'messages', 'tasks', 'turns', 'threads', 'trips', 'memories', 'sourceArtifacts', 'proposals'];
  return REFERENCE_KEYS.every((k, i) => retain[keys[i]] === refs[k].length);
}
export function decodeResultPreview(v: unknown, c: Selected, a: ResultActor, now: number): Record<string, unknown> | null {
  if (!record(v) || !exact(v, [...bindingKeys, 'kind', 'graph', 'eraseCounts', 'retainCounts', 'retainedReferences', 'conflicts', 'eligible', 'progressCount'])
    || !validBinding(v, now) || !bound(v, c, a) || v.kind !== 'preview' || !validGraph(v.graph)
    || !counts(v.eraseCounts, ERASED_KEYS) || !counts(v.retainCounts, RETAINED_KEYS) || !validReferences(v.retainedReferences)
    || !conflicts(v.conflicts) || v.eligible !== (v.conflicts.length === 0) || !natural(v.progressCount) || !size(v)) return null;
  if (v.eligible && (!graphRoot(v.graph, v) || !cardinalities(v.graph, v.eraseCounts, v.retainCounts) || !referencesMatch(v.retainedReferences, v.retainCounts))) return null;
  if (v.scope === 'result-sensitive-data/1') {
    if (v.progressCount !== 0 || v.eligible && (v.retainedReferences.conversationIds.length !== 1 || v.retainedReferences.goalIds.length !== 1
      || v.retainedReferences.messageIds.length !== 1 || v.retainedReferences.taskIds.length !== 1 || v.retainedReferences.turnIds.length === 0)) return null;
  } else if (v.progressCount !== c.objectIds.length || !emptyGraph(v.graph) || REFERENCE_KEYS.some(k => (v.retainedReferences as ResultReferences)[k].length !== 0)
    || !zero(v.eraseCounts) || !zero(v.retainCounts)) return null;
  return v;
}
export function validDecision(v: unknown, scope: string, capturedAt: number, expiresAt: number, now: number, selectedCount: number): v is ResultDecision {
  if (!record(v) || !exact(v, ['requestDigest', 'decidedAt', 'graph', 'erasedCounts', 'retainedCounts', 'clearedPreviews', 'retainedFences', 'sourceResult', 'sourceConversation', 'sourceTrip', 'explicitMemory', 'externalCopies'])
    || !hash(v.requestDigest) || !positive(v.decidedAt) || v.decidedAt < capturedAt || v.decidedAt >= expiresAt || v.decidedAt > now
    || !validGraph(v.graph) || !counts(v.erasedCounts, ERASED_KEYS) || !counts(v.retainedCounts, RETAINED_KEYS)
    || !natural(v.clearedPreviews) || !natural(v.retainedFences) || v.sourceConversation !== 'not_modified' || v.sourceTrip !== 'not_modified'
    || v.explicitMemory !== 'not_modified' || v.externalCopies !== 'not_erased') return false;
  if (scope === 'result-sensitive-data/1') return v.sourceResult === 'erased' && v.clearedPreviews === 0
    && v.retainedFences === fenceCount(v.graph) && cardinalities(v.graph, v.erasedCounts, v.retainedCounts);
  return scope === 'result-delete-progress/1' && v.sourceResult === 'not_modified' && v.clearedPreviews <= selectedCount
    && v.retainedFences === selectedCount && emptyGraph(v.graph) && zero(v.erasedCounts) && zero(v.retainedCounts);
}
export function decodeResultReceipt(v: unknown, c: Selected, a: ResultActor, digest: string, now: number): ResultReceipt | null {
  if (!record(v) || !exact(v, [...bindingKeys, 'kind', 'state', 'decision']) || !validBinding(v, now, true) || !bound(v, c, a)
    || v.kind !== 'receipt' || v.state !== 'erased' || !validDecision(v.decision, v.scope, v.capturedAt, v.expiresAt, now, c.objectIds.length)
    || v.decision.requestDigest !== digest || !graphRoot(v.decision.graph, v) || !size(v)) return null;
  return v as ResultReceipt;
}
export function decodeResultUnknown(v: unknown, c: Selected, a: ResultActor, digest: string): boolean {
  return record(v) && exact(v, ['schemaVersion', 'kind', ...selectionKeys, 'ownerId', 'sessionId', 'mobileEpoch', 'requestDigest', 'allUserDataCompleted'])
    && v.schemaVersion === RESULT_SCHEMA && v.kind === 'unknown' && actorMatches(v, a) && sameSelection(v, c)
    && v.requestDigest === digest && v.allUserDataCompleted === false && size(v);
}
/** Complete persisted operation inventory, including finite decisions and enumerable permanent identity fences. */
export function validOperationRow(v: unknown, owner: string, now: number): boolean {
  if (!record(v) || !exact(v, ['requestId', 'ownerId', 'sessionId', 'mobileEpoch', 'scope', 'rootKind', 'rootId', 'objectIds', 'sourceDigest', 'previewDigest',
    'sourceAuthorities', 'capturedAt', 'expiresAt', 'requestDigest', 'state', 'previewErased', 'graph', 'eraseCounts', 'retainCounts', 'retainedReferences', 'conflicts', 'decision'])
    || !validSelection(v) || v.ownerId !== owner || !identifier(v.sessionId) || !positive(v.mobileEpoch) || !hash(v.sourceDigest) || !hash(v.previewDigest)
    || !positive(v.capturedAt) || v.capturedAt > now || v.expiresAt !== v.capturedAt + RESULT_LIMITS.lifetimeMs || !validSourceAuthorities(v.sourceAuthorities)
    || v.scope === 'result-sensitive-data/1' && v.sourceAuthorities.length === 0 || (v.state !== 'previewed' && v.state !== 'erased') || typeof v.previewErased !== 'boolean') return false;
  if (v.previewErased ? [v.graph, v.eraseCounts, v.retainCounts, v.retainedReferences, v.conflicts].some(x => x !== null)
    : !validGraph(v.graph) || !counts(v.eraseCounts, ERASED_KEYS) || !counts(v.retainCounts, RETAINED_KEYS) || !validReferences(v.retainedReferences) || !conflicts(v.conflicts)) return false;
  if (!v.previewErased) {
    if (!validGraph(v.graph) || !counts(v.eraseCounts, ERASED_KEYS) || !counts(v.retainCounts, RETAINED_KEYS) || !validReferences(v.retainedReferences)) return false;
    if ((v.conflicts as string[]).length === 0 && (!graphRoot(v.graph, v) || !cardinalities(v.graph, v.eraseCounts, v.retainCounts) || !referencesMatch(v.retainedReferences, v.retainCounts))) return false;
    if (v.scope === 'result-delete-progress/1' && (!emptyGraph(v.graph) || !zero(v.eraseCounts) || !zero(v.retainCounts) || REFERENCE_KEYS.some(k => (v.retainedReferences as ResultReferences)[k].length !== 0))) return false;
  }
  return v.state === 'previewed' ? v.requestDigest === null && v.decision === null
    : hash(v.requestDigest) && validDecision(v.decision, String(v.scope), v.capturedAt, Number(v.expiresAt), now, (v.objectIds as string[]).length)
      && v.decision.requestDigest === v.requestDigest && graphRoot(v.decision.graph, v) && v.previewErased === true;
}
export function validResultListItem(v: unknown, now: number): boolean {
  return record(v) && exact(v, ['rootKind', 'rootId', 'createdAt', 'currentRevision', 'revisionCount', 'eventCount', 'lifecycle', 'resultTypes'])
    && v.rootKind === 'artifact' && identifier(v.rootId) && positive(v.createdAt) && v.createdAt <= now
    && positive(v.currentRevision) && v.currentRevision <= 1000 && v.revisionCount === v.currentRevision
    && positive(v.eventCount) && v.eventCount >= v.revisionCount && v.eventCount <= 3000
    && (v.lifecycle === 'active' || v.lifecycle === 'withdrawn') && Array.isArray(v.resultTypes) && v.resultTypes.length > 0
    && v.resultTypes.length <= 5 && v.resultTypes.every((t, i, array) => typeof t === 'string'
      && RESULT_TYPES.includes(t as typeof RESULT_TYPES[number]) && (i === 0 || t > array[i - 1]));
}
export function decodeResultList(v: unknown, c: Extract<ResultCommand, { action: 'list' }>, a: ResultActor, now: number): Record<string, unknown> | null {
  if (!record(v) || !exact(v, ['schemaVersion', 'kind', 'scope', 'rootKind', 'ownerId', 'sessionId', 'mobileEpoch', 'sourceDigest', 'capturedAt', 'expiresAt', 'items', 'hasMore', 'nextCursor', 'allUserDataCompleted'])
    || v.schemaVersion !== RESULT_SCHEMA || v.kind !== 'list' || !resultScope(v.scope) || v.scope !== c.scope || v.rootKind !== c.rootKind || !actorMatches(v, a)
    || !hash(v.sourceDigest) || !positive(v.capturedAt) || v.capturedAt > now || v.expiresAt !== v.capturedAt + RESULT_LIMITS.lifetimeMs || Number(v.expiresAt) <= now
    || c.cursor && c.cursor.sourceDigest !== v.sourceDigest || !Array.isArray(v.items) || v.items.length > 20 || typeof v.hasMore !== 'boolean' || v.allUserDataCompleted !== false || !size(v)) return null;
  let last = c.cursor?.afterId ?? '';
  for (const item of v.items) {
    if (!record(item)) return null;
    const id = v.scope === 'result-sensitive-data/1' ? item.rootId : item.requestId;
    if (!identifier(id) || id <= last || (v.scope === 'result-sensitive-data/1' ? !validResultListItem(item, now) : !validOperationRow(item, a.ownerId, now))) return null;
    last = id;
  }
  if (v.hasMore ? v.items.length !== 20 || !record(v.nextCursor) || !exact(v.nextCursor, ['sourceDigest', 'afterId']) || v.nextCursor.sourceDigest !== v.sourceDigest || v.nextCursor.afterId !== last : v.nextCursor !== null) return null;
  return v;
}
