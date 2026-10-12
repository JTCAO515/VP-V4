import { SCHEMA, NOTICE, TTL, ENTRIES, record, exact, uuid, positive, natural, hash, source, signal, clock } from '../../journey-entry/experience-measurement/contract.ts';
import { clockOrigin } from '../../journey-entry/experience-measurement/acceptance.ts';
import { CONTROL_ROWS } from './recovery.ts';
export const MEASUREMENT_ROW_COUNTS = CONTROL_ROWS;
const instant = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
const time = (v: unknown) => Date.parse(String(v));
const retained = (start: unknown, expiry: unknown, now: number) => instant(start) && instant(expiry)
  && time(start) <= now && time(expiry) > now && time(expiry) > time(start) && time(expiry) <= time(start) + TTL;
const sorted = (rows: unknown, key: string, validate: (row: Record<string, unknown>) => boolean): rows is Record<string, unknown>[] => {
  if (!Array.isArray(rows) || rows.length > 10000) return false;
  let previous = '';
  for (const row of rows) { if (!record(row) || !uuid(row[key]) || String(row[key]) <= previous || !validate(row)) return false; previous = String(row[key]); }
  return true;
};
const CONSENT = ['owner_id', 'consent_id', 'operation_id', 'request_metadata_digest', 'session_id', 'mobile_epoch', 'notice_version', 'entries', 'accepted_at', 'expires_at', 'revoked_at'];
const ADMISSION = ['owner_id', 'admission_id', 'request_metadata_digest', 'consent_id', 'entry', 'source_kind', 'source_id', 'source_revision', 'source_ref', 'clock_origin', 'task_id', 'goal_id', 'accepted_at', 'received_at', 'expires_at', 'session_id', 'mobile_epoch', 'first_ever'];
const REPORT = ['owner_id', 'report_id', 'request_metadata_digest', 'admission_id', 'signal', 'clock', 'received_at', 'expires_at'];
const ERASURE = ['owner_id', 'operation_id', 'consent_id', 'state', 'source_digest', 'preview_digest', 'request_metadata_digest', 'erased_rows', 'decided_at', 'expires_at'];
const COPY = ['owner_id', 'copy_id', 'generation', 'kind', 'core_request_id', 'source_digest', 'state', 'received_at', 'expires_at'];
const CONTROL = ['owner_id', 'control_id', 'reconciliation_generation', 'erasure_floor', 'covered_from_at', 'covered_through_at', 'coverage_complete', 'authority_received_at', 'expires_at'];
const JOURNAL = ['owner_id', 'journal_id', 'event_kind', 'authority_id', 'floor', 'authority_received_at', 'expires_at'];
/** Exact seven-section SQL projection from the sole owner's current candidate.
 * Request digests bind closed metadata only. No arbitrary row/JSON fallback,
 * runtime schema adoption, independent-journal authentication or ACK inference. */
export function validMeasurementMetadata(v: unknown, now: number, owner?: string, excludedCopyId?: string): v is Record<string, unknown> {
  if (!record(v) || !exact(v, ['schemaVersion', 'ownerId', ...CONTROL_ROWS, 'sourceRows']) || v.schemaVersion !== SCHEMA
    || !uuid(v.ownerId) || owner !== undefined && v.ownerId !== owner || !Number.isFinite(now)
    || !record(v.sourceRows) || !exact(v.sourceRows, CONTROL_ROWS)) return false;
  const owns = (r: Record<string, unknown>) => r.owner_id === v.ownerId;
  if (!sorted(v.consents, 'consent_id', c => owns(c) && exact(c, CONSENT) && [c.operation_id, c.session_id].every(uuid)
    && hash(c.request_metadata_digest) && positive(c.mobile_epoch) && c.notice_version === NOTICE && retained(c.accepted_at, c.expires_at, now)
    && (c.revoked_at === null || instant(c.revoked_at) && time(c.revoked_at) >= time(c.accepted_at) && time(c.revoked_at) <= now)
    && Array.isArray(c.entries) && c.entries.length > 0 && c.entries.length <= 3
    && c.entries.every((e, i) => ENTRIES.includes(e) && (i === 0 || ENTRIES.indexOf((c.entries as typeof ENTRIES[number][])[i - 1]) < ENTRIES.indexOf(e))))) return false;
  if (v.consents.length > 1) return false; // current SQL owner primary key
  if (!sorted(v.admissions, 'admission_id', a => {
    if (!owns(a) || !exact(a, ADMISSION) || !hash(a.request_metadata_digest) || ![a.consent_id, a.source_id, a.session_id].every(uuid)
      || !positive(a.mobile_epoch) || !ENTRIES.includes(a.entry as typeof ENTRIES[number]) || !source(a.source_ref, a.entry as typeof ENTRIES[number])
      || !clockOrigin(a.clock_origin) || !retained(a.received_at, a.expires_at, now) || !['proven', 'unknown'].includes(String(a.first_ever))) return false;
    const s = a.source_ref;
    if (s.kind === 'service_task') return a.source_kind === 'service_task' && a.source_id === s.id && a.task_id === s.id && a.source_revision === null
      && (a.goal_id === null || uuid(a.goal_id)) && instant(a.accepted_at) && time(a.accepted_at) <= time(a.received_at);
    return a.source_kind === 'native_entry' && a.source_id === s.logicalId && a.source_revision === null && a.task_id === null && a.accepted_at === null
      && (s.entry === 'e2' ? a.goal_id === null : a.goal_id === s.anchor.goalId);
  })) return false;
  if (!sorted(v.reports, 'report_id', r => owns(r) && exact(r, REPORT) && hash(r.request_metadata_digest) && uuid(r.admission_id)
    && signal(r.signal) && clock(r.clock) && retained(r.received_at, r.expires_at, now))) return false;
  if (!sorted(v.erasureReceipts, 'operation_id', e => owns(e) && exact(e, ERASURE) && (e.consent_id === null || uuid(e.consent_id))
    && ['preview', 'incomplete', 'erased'].includes(String(e.state)) && (e.source_digest === null || hash(e.source_digest)) && (e.preview_digest === null || hash(e.preview_digest))
    && (e.state === 'preview' ? e.request_metadata_digest === null : hash(e.request_metadata_digest))
    && natural(e.erased_rows) && e.erased_rows <= 10000 && retained(e.decided_at, e.expires_at, now))) return false;
  if (!Array.isArray(v.copyObligations) || v.copyObligations.length > 10000) return false;
  let previous = '';
  for (const c of v.copyObligations) {
    if (!record(c) || !owns(c) || !exact(c, COPY) || !uuid(c.copy_id) || c.copy_id === excludedCopyId || !positive(c.generation) || c.generation > 3
      || !['core_export', 'independent_journal', 'external_download'].includes(String(c.kind)) || !hash(c.source_digest)
      || !['pending', 'erased', 'unknown'].includes(String(c.state)) || !retained(c.received_at, c.expires_at, now)
      || (c.kind === 'core_export' ? c.core_request_id !== c.copy_id : c.core_request_id !== null)) return false;
    const key = `${c.copy_id}:${c.generation}`; if (key <= previous) return false; previous = key;
  }
  if (!sorted(v.recoveryControls, 'control_id', c => owns(c) && exact(c, CONTROL) && positive(c.reconciliation_generation) && natural(c.erasure_floor)
    && instant(c.covered_from_at) && instant(c.covered_through_at) && time(c.covered_from_at) <= time(c.covered_through_at) && time(c.covered_through_at) <= now
    && typeof c.coverage_complete === 'boolean' && retained(c.authority_received_at, c.expires_at, now)) || v.recoveryControls.length > 1) return false;
  if (!sorted(v.journals, 'journal_id', j => owns(j) && exact(j, JOURNAL) && uuid(j.authority_id) && j.authority_id !== excludedCopyId
    && ['withdrawal', 'erasure', 'source_expiry', 'copy_obligation', 'copy_ack'].includes(String(j.event_kind)) && natural(j.floor)
    && retained(j.authority_received_at, j.expires_at, now))) return false;
  if (new Set(v.journals.map(j => `${j.event_kind}:${j.authority_id}`)).size !== v.journals.length) return false;
  const consents = new Map(v.consents.map(c => [c.consent_id, c])), admissions = new Map(v.admissions.map(a => [a.admission_id, a]));
  for (const a of v.admissions) {
    const c = consents.get(a.consent_id);
    if (!c || c.revoked_at !== null || !(c.entries as unknown[]).includes(a.entry) || a.session_id !== c.session_id || a.mobile_epoch !== c.mobile_epoch
      || time(a.received_at) < time(c.accepted_at) || time(a.expires_at) > time(c.expires_at)
      || a.entry === 'e1' && time(a.accepted_at) < time(c.accepted_at)) return false;
  }
  for (const r of v.reports) {
    const a = admissions.get(r.admission_id);
    if (!a || time(r.received_at) < time(a.received_at) || time(r.expires_at) > time(a.expires_at)) return false;
    if (record(r.clock) && r.clock.kind === 'local_elapsed' && (!record(a.clock_origin) || a.clock_origin.kind !== 'native_monotonic' || r.clock.processId !== a.clock_origin.processId)) return false;
  }
  return CONTROL_ROWS.every(k => (v.sourceRows as Record<string, unknown>)[k] === (v[k] as unknown[]).length)
    && Object.values(v.sourceRows).every(natural) && Object.values(v.sourceRows).reduce<number>((n, x) => n + Number(x), 0) <= 10000;
}
