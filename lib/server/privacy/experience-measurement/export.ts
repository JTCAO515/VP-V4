import { createHash } from 'node:crypto';
import { SCHEMA, PURPOSE, NOTICE, TTL, ENTRIES, record, exact, uuid, positive, natural, hash, source, signal, clock } from '../../journey-entry/experience-measurement/contract.ts';
import { decodeProfileExportPage } from '../profile-export/contract.ts';
import { exportCanonical, type ExportHandler, type ExportLease, type ExportModuleReceipt } from '../export-dispatcher.ts';
// Same existing D2 domain port shape; no second job/lease/encryption engine.
export type ProfileDomainRPC = (action: string, input: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>;
const instant = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
const retained = (start: unknown, expiry: unknown, now: number) => instant(start) && instant(expiry)
  && Date.parse(start) <= now && Date.parse(expiry) > now && Date.parse(expiry) > Date.parse(start) && Date.parse(expiry) <= Date.parse(start) + TTL;
const sorted = (rows: unknown, key: string, validate: (row: Record<string, unknown>) => boolean): rows is Record<string, unknown>[] => {
  if (!Array.isArray(rows) || rows.length > 10000) return false;
  let previous = '';
  for (const row of rows) { if (!record(row) || !uuid(row[key]) || String(row[key]) <= previous || !validate(row)) return false; previous = String(row[key]); }
  return true;
};
export const MEASUREMENT_ROW_COUNTS = ['consents', 'admissions', 'reports', 'erasureReceipts'] as const;
const CONSENT_KEYS = ['owner_id', 'consent_id', 'operation_id', 'session_id', 'mobile_epoch', 'notice_version', 'entries', 'accepted_at', 'expires_at', 'revoked_at'] as const;
const ADMISSION_KEYS = ['owner_id', 'admission_id', 'consent_id', 'entry', 'source_kind', 'source_id', 'source_revision', 'task_id', 'goal_id', 'accepted_at', 'received_at', 'expires_at', 'session_id', 'mobile_epoch', 'first_ever'] as const;
const REPORT_KEYS = ['owner_id', 'report_id', 'admission_id', 'signal', 'clock', 'received_at', 'expires_at'] as const;
const ERASURE_KEYS = ['owner_id', 'operation_id', 'consent_id', 'state', 'source_digest', 'preview_digest', 'erased_rows', 'decided_at', 'expires_at'] as const;
/** Exact initial SQL-source projection, including its real snake-case column
 * names. Future ticket columns need an explicit full source decoder revision;
 * arbitrary JSON/to_jsonb fallback is never accepted. No lifecycle claim. */
export function validMeasurementMetadata(v: unknown, now: number, owner?: string): v is Record<string, unknown> {
  if (!record(v) || !exact(v, ['schemaVersion', 'ownerId', ...MEASUREMENT_ROW_COUNTS, 'sourceRows'])
    || v.schemaVersion !== SCHEMA || !uuid(v.ownerId) || owner !== undefined && v.ownerId !== owner
    || !record(v.sourceRows) || !exact(v.sourceRows, MEASUREMENT_ROW_COUNTS)) return false;
  const owns = (r: Record<string, unknown>) => r.owner_id === v.ownerId;
  if (!sorted(v.consents, 'consent_id', c => owns(c) && exact(c, CONSENT_KEYS) && [c.operation_id, c.session_id].every(uuid)
    && positive(c.mobile_epoch) && c.notice_version === NOTICE && retained(c.accepted_at, c.expires_at, now)
    && (c.revoked_at === null || instant(c.revoked_at) && Date.parse(c.revoked_at) >= Date.parse(String(c.accepted_at)) && Date.parse(c.revoked_at) <= now)
    && Array.isArray(c.entries) && c.entries.length > 0 && c.entries.length <= 3
    && c.entries.every((e, i) => ENTRIES.includes(e) && (i === 0 || ENTRIES.indexOf((c.entries as typeof ENTRIES[number][])[i - 1]) < ENTRIES.indexOf(e))))) return false;
  if (!sorted(v.admissions, 'admission_id', a => owns(a) && exact(a, ADMISSION_KEYS) && [a.consent_id, a.source_id, a.session_id].every(uuid)
    && positive(a.mobile_epoch) && a.entry === 'e1' && a.source_kind === 'service_task' && a.task_id === a.source_id && a.source_revision === null
    && (a.goal_id === null || uuid(a.goal_id)) && instant(a.accepted_at) && instant(a.received_at)
    && Date.parse(a.accepted_at) <= Date.parse(a.received_at) && retained(a.received_at, a.expires_at, now)
    && ['proven', 'unknown'].includes(String(a.first_ever)))) return false;
  if (!sorted(v.reports, 'report_id', r => owns(r) && exact(r, REPORT_KEYS) && uuid(r.admission_id)
    && signal(r.signal) && clock(r.clock) && retained(r.received_at, r.expires_at, now))) return false;
  if (!sorted(v.erasureReceipts, 'operation_id', e => owns(e) && exact(e, ERASURE_KEYS) && (e.consent_id === null || uuid(e.consent_id))
    && ['preview', 'erased'].includes(String(e.state)) && (e.source_digest === null || hash(e.source_digest)) && (e.preview_digest === null || hash(e.preview_digest))
    && natural(e.erased_rows) && e.erased_rows <= 10000 && retained(e.decided_at, e.expires_at, now))) return false;
  const consents = new Map(v.consents.map(c => [c.consent_id, c])); const admissions = new Map(v.admissions.map(a => [a.admission_id, a]));
  for (const a of v.admissions) { const c = consents.get(a.consent_id); if (!c || c.revoked_at !== null || !(c.entries as unknown[]).includes(a.entry)
    || a.session_id !== c.session_id || a.mobile_epoch !== c.mobile_epoch || Date.parse(String(a.received_at)) < Date.parse(String(c.accepted_at))
    || Date.parse(String(a.expires_at)) > Date.parse(String(c.expires_at))) return false; }
  for (const r of v.reports) { const a = admissions.get(r.admission_id); if (!a || Date.parse(String(r.received_at)) < Date.parse(String(a.received_at))
    || Date.parse(String(r.expires_at)) > Date.parse(String(a.expires_at))) return false; }
  return MEASUREMENT_ROW_COUNTS.every(k => (v.sourceRows as Record<string, unknown>)[k] === (v[k] as unknown[]).length)
    && Object.values(v.sourceRows).every(natural) && Object.values(v.sourceRows).reduce<number>((n, x) => n + Number(x), 0) <= 10000;
}
export const EXTENDED_PROFILE_SCHEMA = 'profile-core-export/1' as const;
/** Candidate replacement of the original Profile handler, retaining nine D2
 * modules, fixed snapshot section and original encrypted artifact lifecycle. */
export function measurementProfileExportHandler(lease: ExportLease, domain: ProfileDomainRPC, now: () => number = Date.now): ExportHandler & {
  matchesReceipt(receipt: ExportModuleReceipt | undefined): boolean;
} {
  if (![lease.requestId, lease.ownerId, lease.leaseId].every(uuid) || !positive(lease.generation)) throw Error('MEASUREMENT_UNAVAILABLE');
  let captured: { encoded: string; digest: string; limit: number } | null = null;
  return {
    sections: ['snapshot'], consistency: 'snapshot',
    matchesReceipt: receipt => !!receipt && receipt.module === 'profile' && (captured ? receipt.status === 'complete' && receipt.reason === 'NONE'
      && receipt.rows === 1 && receipt.pages === 1 && receipt.digest === captured.digest : receipt.status !== 'complete' && receipt.rows === 0 && receipt.pages === 0),
    async page(section, cursor, limit, abort) {
      if (section !== 'snapshot' || cursor !== null || !positive(limit) || limit > 100 || abort.aborted || captured && captured.limit !== limit) throw Error('MEASUREMENT_UNAVAILABLE');
      const value = await domain('profile_page', { requestId: lease.requestId, leaseId: lease.leaseId, generation: lease.generation, section, cursor, limit }, abort);
      // Preserve the original Profile snapshot for installations without this
      // new suffix. Never reinterpret an old snapshot as measurement coverage.
      if (record(value) && value.schemaVersion === 'profile-core-export/1' && Array.isArray(value.items) && record(value.items[0]) && !Object.hasOwn(value.items[0], 'journeyMeasurement')) {
        const original = decodeProfileExportPage(value, limit, lease.ownerId, now());
        if (!original || abort.aborted) throw Error('MEASUREMENT_SOURCE_UNAVAILABLE');
        const encoded = exportCanonical({ snapshot: original.items }); const digest = createHash('sha256').update(encoded).digest('hex');
        if (digest !== original.sourceDigest || captured && captured.encoded !== encoded) throw Error('MEASUREMENT_SOURCE_CHANGED');
        captured = { encoded, digest, limit }; return { items: original.items, hasMore: false, nextCursor: null, sectionComplete: true };
      }
      if (!record(value) || value.schemaVersion !== EXTENDED_PROFILE_SCHEMA || !Array.isArray(value.items) || value.items.length !== 1
        || !hash(value.sourceDigest) || Buffer.byteLength(JSON.stringify(value)) > 1_000_000) throw Error('MEASUREMENT_SOURCE_UNAVAILABLE');
      const item = value.items[0];
      if (!record(item) || !exact(item, ['ownerId', 'profile', 'watermark', 'operations', 'sourceRows', 'journeyMeasurement'])
        || item.ownerId !== lease.ownerId || !validMeasurementMetadata(item.journeyMeasurement, now(), lease.ownerId) || !record(item.sourceRows)
        || !exact(item.sourceRows, ['profiles', 'watermarks', 'operations', 'measurement']) || !record(item.sourceRows.measurement) || !exact(item.sourceRows.measurement, MEASUREMENT_ROW_COUNTS)) throw Error('MEASUREMENT_SOURCE_UNAVAILABLE');
      const actual = Object.values(item.journeyMeasurement.sourceRows as Record<string, number>).reduce((n, x) => n + x, 0);
      if (exportCanonical(item.sourceRows.measurement) !== exportCanonical(item.journeyMeasurement.sourceRows) || actual + ['profiles', 'watermarks', 'operations'].reduce((n, k) => n + Number((item.sourceRows as Record<string, unknown>)[k]), 0) > 10000) throw Error('MEASUREMENT_CAPACITY');
      const { journeyMeasurement: _measurement, ...original } = item;
      const { measurement: _rows, ...originalRows } = item.sourceRows;
      const baseline = { ...value, schemaVersion: 'profile-core-export/1', items: [{ ...original, sourceRows: originalRows }] };
      if (!decodeProfileExportPage(baseline, limit, lease.ownerId, now())) throw Error('MEASUREMENT_SOURCE_UNAVAILABLE');
      const encoded = exportCanonical({ snapshot: value.items }); const digest = createHash('sha256').update(encoded).digest('hex');
      if (digest !== value.sourceDigest || captured && captured.encoded !== encoded || abort.aborted) throw Error('MEASUREMENT_SOURCE_CHANGED');
      captured = { encoded, digest, limit };
      return { items: structuredClone(value.items), hasMore: false, nextCursor: null, sectionComplete: true };
    },
  };
}
