import { parseClosedJSON } from './json.ts';
import { source, clockOrigin, type Source, type ClockOrigin } from './acceptance.ts';
export { source, sameSource } from './acceptance.ts';
export type { Source, ClockOrigin } from './acceptance.ts';
export const SCHEMA = 'journey-experience-measurement/1' as const;
export const PURPOSE = 'journey_experience_measurement' as const;
export const NOTICE = 'journey-experience-measurement/2026-10-12' as const;
export const TTL = 30 * 86400_000;
export const CAPABILITIES = ['receive', 'aggregate', 'export', 'erase', 'restoreFence', 'purge'] as const;
export const ENTRIES = ['e1', 'e2', 'e3'] as const;
export type Entry = typeof ENTRIES[number];
export type Actor = Readonly<{ ownerId: string; sessionId: string; mobileEpoch: number }>;
export const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
export const exact = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
export const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
export const natural = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export const positive = (v: unknown): v is number => natural(v) && v > 0;
export const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export const member = <T extends string>(v: unknown, values: readonly T[]): v is T => typeof v === 'string' && values.includes(v as T);
export type Artifact = Readonly<{ id: string; revision: number }>;
export const artifact = (v: unknown): v is Artifact => record(v) && exact(v, ['id', 'revision']) && uuid(v.id) && positive(v.revision) && v.revision <= 1000;
export const OUTCOMES = ['completed', 'partial', 'blocked', 'technical_failure', 'unknown'] as const;
export const FIELDS = ['city', 'comparisonTarget', 'durationDays', 'partySize', 'interests', 'pace', 'lodgingBudget', 'dates', 'mobilityConstraints'] as const;
export const BASES = ['already_known_applicable', 'genuinely_missing', 'user_changed', 'source_conflict', 'unknown'] as const;
export const WRITERS = ['directions_selected', 'directions_saved', 'decision_chosen', 'trip_confirmed'] as const;
export type Signal = Readonly<{ kind: 'accepted' | 'zero_questions' }>
  | Readonly<{ kind: 'server_ready'; artifact: Artifact }>
  | Readonly<{ kind: 'presented'; artifact: Artifact; outcome: typeof OUTCOMES[number] }>
  | Readonly<{ kind: 'writer'; artifact: Artifact; writer: typeof WRITERS[number]; operationId: string }>
  | Readonly<{ kind: 'declined'; artifact: Artifact; reason: 'not_useful' | 'changed_need' | 'other' | 'unspecified' }>
  | Readonly<{ kind: 'terminal'; outcome: typeof OUTCOMES[number] }>
  | Readonly<{ kind: 'question'; field: typeof FIELDS[number]; basis: typeof BASES[number]; questionId: string }>;
export function signal(v: unknown): v is Signal {
  if (!record(v)) return false;
  switch (v.kind) {
    case 'accepted': case 'zero_questions': return exact(v, ['kind']);
    case 'server_ready': return exact(v, ['kind', 'artifact']) && artifact(v.artifact);
    case 'presented': return exact(v, ['kind', 'artifact', 'outcome']) && artifact(v.artifact) && member(v.outcome, OUTCOMES);
    case 'writer': return exact(v, ['kind', 'artifact', 'writer', 'operationId']) && artifact(v.artifact) && member(v.writer, WRITERS) && uuid(v.operationId);
    case 'declined': return exact(v, ['kind', 'artifact', 'reason']) && artifact(v.artifact) && member(v.reason, ['not_useful', 'changed_need', 'other', 'unspecified']);
    case 'terminal': return exact(v, ['kind', 'outcome']) && member(v.outcome, OUTCOMES);
    case 'question': return exact(v, ['kind', 'field', 'basis', 'questionId']) && member(v.field, FIELDS) && member(v.basis, BASES) && uuid(v.questionId);
    default: return false;
  }
}
// A local elapsed duration is a claim with process provenance. SQL must not
// convert authority receive time into render time or compare separate boots.
export type Clock = Readonly<{ kind: 'unknown' }> | Readonly<{ kind: 'local_elapsed'; processId: string; elapsedMs: number }>;
export const clock = (v: unknown): v is Clock => record(v) && (v.kind === 'unknown' ? exact(v, ['kind'])
  : v.kind === 'local_elapsed' && exact(v, ['kind', 'processId', 'elapsedMs']) && uuid(v.processId) && natural(v.elapsedMs) && v.elapsedMs <= 2147483647);
export type Command = Readonly<{ action: 'policy' }>
  | Readonly<{ action: 'consent'; operationId: string; noticeVersion: typeof NOTICE; entries: readonly Entry[] }>
  | Readonly<{ action: 'withdraw'; operationId: string; consentId: string }>
  | Readonly<{ action: 'admit'; operationId: string; consentId: string; entry: Entry; source: Source; clockOrigin: ClockOrigin }>
  | Readonly<{ action: 'receive'; consentId: string; admissionId: string; reportId: string; source: Source; entry: Entry; signal: Signal; clock: Clock }>
  | Readonly<{ action: 'aggregate'; consentId: string; entry: Entry }>
  | Readonly<{ action: 'preview'; operationId: string }>
  | Readonly<{ action: 'erase'; operationId: string; sourceDigest: string; previewDigest: string }>
  | Readonly<{ action: 'recover'; operationId: string; mutationBytes: string }>;
export function parseCommand(v: unknown): Command | null {
  if (!record(v) || v.schemaVersion !== SCHEMA || v.purpose !== PURPOSE) return null;
  const keys = ['schemaVersion', 'purpose', 'action'];
  let valid = false;
  switch (v.action) {
    case 'policy': valid = exact(v, keys); break;
    case 'consent': valid = exact(v, [...keys, 'operationId', 'noticeVersion', 'entries']) && uuid(v.operationId) && v.noticeVersion === NOTICE
      && Array.isArray(v.entries) && v.entries.length > 0 && v.entries.length <= 3
      && v.entries.every((s, i) => member(s, ENTRIES) && (i === 0 || ENTRIES.indexOf((v.entries as Entry[])[i - 1]) < ENTRIES.indexOf(s))); break;
    case 'withdraw': valid = exact(v, [...keys, 'operationId', 'consentId']) && uuid(v.operationId) && uuid(v.consentId); break;
    case 'admit': valid = exact(v, [...keys, 'operationId', 'consentId', 'entry', 'source', 'clockOrigin']) && uuid(v.operationId) && uuid(v.consentId)
      && member(v.entry, ENTRIES) && source(v.source, v.entry) && clockOrigin(v.clockOrigin); break;
    case 'receive': valid = exact(v, [...keys, 'consentId', 'admissionId', 'reportId', 'source', 'entry', 'signal', 'clock'])
      && [v.consentId, v.admissionId, v.reportId].every(uuid) && member(v.entry, ENTRIES) && signal(v.signal) && clock(v.clock)
      && source(v.source, v.entry); break;
    case 'aggregate': valid = exact(v, [...keys, 'consentId', 'entry']) && uuid(v.consentId) && member(v.entry, ENTRIES); break;
    case 'preview': valid = exact(v, [...keys, 'operationId']) && uuid(v.operationId); break;
    case 'erase': valid = exact(v, [...keys, 'operationId', 'sourceDigest', 'previewDigest']) && uuid(v.operationId) && hash(v.sourceDigest) && hash(v.previewDigest); break;
    case 'recover': {
      if (exact(v, [...keys, 'operationId', 'mutationBytes']) && uuid(v.operationId) && typeof v.mutationBytes === 'string' && Buffer.byteLength(v.mutationBytes) <= 4096) {
        try { const original = parseCommand(parseClosedJSON(v.mutationBytes)); valid = original?.action === 'erase' && original.operationId === v.operationId; } catch { /* invalid original bytes */ }
      }
      break;
    }
  }
  return valid ? v as unknown as Command : null;
}
export const bound = (v: Record<string, unknown>, actor: Actor) => v.schemaVersion === SCHEMA && v.purpose === PURPOSE
  && v.ownerId === actor.ownerId && v.sessionId === actor.sessionId && v.mobileEpoch === actor.mobileEpoch;
