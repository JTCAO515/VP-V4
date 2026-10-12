import { SCHEMA, PURPOSE, NOTICE, TTL, CAPABILITIES, ENTRIES, exact, record, uuid, natural, positive, hash, bound, source,
  sameSource, type Actor, type Command } from './contract.ts';
export const COUNTERS = ['allTasks', 'availableTasks', 'firstValueTasks', 'activatedTasks', 'declinedOpportunities', 'presentedOpportunities',
  'technicalFailures', 'uncompletedTasks', 'unobservableTasks', 'unknownFirstEverTasks', 'repeatQuestions', 'judgableQuestions',
  'unknownQuestions', 'zeroQuestionTasks', 'unknownTimeTasks', 'completedTasks', 'partialTasks', 'blockedTasks'] as const;
const base = ['schemaVersion', 'purpose', 'kind', 'ownerId', 'sessionId', 'mobileEpoch'] as const;
const retention = (v: Record<string, unknown>, now: number) => positive(v.receivedAt) && v.receivedAt <= now
  && positive(v.expiresAt) && v.expiresAt > now && v.expiresAt > v.receivedAt && v.expiresAt <= v.receivedAt + TTL;
export function decode(value: unknown, command: Command, actor: Actor, now: number, requestDigest?: string): Record<string, unknown> | null {
  if (!record(value) || !bound(value, actor) || !Number.isFinite(now) || Buffer.byteLength(JSON.stringify(value)) > 65536) return null;
  const v = value;
  switch (command.action) {
    case 'policy': {
      if (!exact(v, [...base, 'enabled', 'noticeVersion', 'capabilities', 'capturedAt', 'expiresAt', 'consent']) || v.kind !== 'policy'
        || typeof v.enabled !== 'boolean' || v.noticeVersion !== NOTICE || !Array.isArray(v.capabilities)
        || JSON.stringify(v.capabilities) !== JSON.stringify(CAPABILITIES) || !positive(v.capturedAt) || v.capturedAt > now
        || v.expiresAt !== v.capturedAt + 20000 || Number(v.expiresAt) <= now) return null;
      const c = v.consent;
      if (c !== null && (!record(c) || !exact(c, ['id', 'entries', 'noticeVersion', 'receivedAt', 'expiresAt']) || !uuid(c.id)
        || c.noticeVersion !== NOTICE || !retention(c, now) || !Array.isArray(c.entries) || c.entries.length === 0
        || !c.entries.every((s, i) => ENTRIES.includes(s) && (i === 0 || ENTRIES.indexOf((c.entries as typeof ENTRIES[number][])[i - 1]) < ENTRIES.indexOf(s))))) return null;
      return v;
    }
    case 'consent': return exact(v, [...base, 'operationId', 'consentId', 'noticeVersion', 'entries', 'receivedAt', 'expiresAt', 'reused'])
      && v.kind === 'consent' && v.operationId === command.operationId && uuid(v.consentId) && v.noticeVersion === NOTICE
      && JSON.stringify(v.entries) === JSON.stringify(command.entries) && retention(v, now) && typeof v.reused === 'boolean' ? v : null;
    case 'admit': return exact(v, [...base, 'operationId', 'consentId', 'admissionId', 'entry', 'source', 'admittedAt', 'firstEver', 'receivedAt', 'expiresAt', 'reused'])
      && v.kind === 'admission' && v.operationId === command.operationId && v.consentId === command.consentId && uuid(v.admissionId)
      && v.entry === command.entry && source(v.source) && sameSource(v.source, command.source)
      && (v.admittedAt === null || positive(v.admittedAt) && v.admittedAt <= now) && ['proven', 'unknown'].includes(String(v.firstEver))
      && retention(v, now) && typeof v.reused === 'boolean' ? v : null;
    case 'receive': return exact(v, [...base, 'reportId', 'admissionId', 'consentId', 'state', 'receivedAt', 'expiresAt', 'reused'])
      && v.kind === 'received' && v.reportId === command.reportId && v.admissionId === command.admissionId && v.consentId === command.consentId
      && v.state === 'recorded' && retention(v, now) && typeof v.reused === 'boolean' ? v : null;
    case 'aggregate': {
      if (!exact(v, [...base, 'consentId', 'entry', 'capturedAt', 'expiresAt', 'sample', 'counts']) || v.kind !== 'aggregate'
        || v.consentId !== command.consentId || v.entry !== command.entry || v.sample !== 'qualified_opt_in_authorities'
        || !positive(v.capturedAt) || v.capturedAt > now || v.expiresAt !== v.capturedAt + 20000 || Number(v.expiresAt) <= now
        || !record(v.counts) || !exact(v.counts, COUNTERS) || !COUNTERS.every(k => natural((v.counts as Record<string, unknown>)[k]) && Number((v.counts as Record<string, unknown>)[k]) <= 10000)) return null;
      const c = v.counts as Record<typeof COUNTERS[number], number>;
      if (c.firstValueTasks > c.availableTasks || c.availableTasks > c.allTasks || c.activatedTasks > c.availableTasks
        || c.declinedOpportunities > c.presentedOpportunities || c.repeatQuestions > c.judgableQuestions
        || ['uncompletedTasks', 'unobservableTasks', 'unknownFirstEverTasks', 'zeroQuestionTasks', 'unknownTimeTasks', 'completedTasks', 'partialTasks', 'blockedTasks']
          .some(k => Number(c[k as keyof typeof c]) > c.allTasks)) return null;
      return v;
    }
    case 'preview': return exact(v, [...base, 'operationId', 'scope', 'sourceDigest', 'previewDigest', 'capturedAt', 'expiresAt', 'rows'])
      && v.kind === 'preview' && v.operationId === command.operationId && v.scope === SCHEMA && hash(v.sourceDigest) && hash(v.previewDigest)
      && positive(v.capturedAt) && v.capturedAt <= now && v.expiresAt === v.capturedAt + 30000 && Number(v.expiresAt) > now
      && natural(v.rows) && v.rows <= 10000 ? v : null;
    case 'erase': case 'withdraw': case 'recover': return exact(v, [...base, 'operationId', 'requestDigest', 'decidedAt', 'expiresAt', 'scope', 'state', 'erasedRows', 'consentRevoked', 'fenceRecorded', 'allUserDataCompleted'])
      && v.kind === 'erasure' && v.operationId === command.operationId && v.scope === SCHEMA && v.state === 'erased'
      && hash(requestDigest) && v.requestDigest === requestDigest && positive(v.decidedAt) && v.decidedAt <= now
      && positive(v.expiresAt) && v.expiresAt > now && v.expiresAt <= v.decidedAt + TTL
      && natural(v.erasedRows) && v.erasedRows <= 10000 && v.consentRevoked === true && v.fenceRecorded === true && v.allUserDataCompleted === false ? v : null;
  }
}
export const rate = (numerator: number, denominator: number) => denominator === 0 ? null : numerator / denominator;
/** Rates retain their explicit denominators; no-success/unknown samples stay visible. */
export function rates(counts: Record<typeof COUNTERS[number], number>) {
  return { firstValue: rate(counts.firstValueTasks, counts.allTasks), activationAvailable: rate(counts.activatedTasks, counts.availableTasks),
    activationAll: rate(counts.activatedTasks, counts.allTasks), decline: rate(counts.declinedOpportunities, counts.presentedOpportunities),
    repeatedQuestions: rate(counts.repeatQuestions, counts.judgableQuestions) };
}
