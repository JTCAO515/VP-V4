import { createHash } from 'node:crypto';
import { SCHEMA, PURPOSE, NOTICE, TTL, ENTRIES, record, exact, uuid, positive, natural, hash, source, signal, clock } from '../../journey-entry/experience-measurement/contract.ts';
import { decodeProfileExportPage } from '../profile-export/contract.ts';
import { exportCanonical, type ExportHandler, type ExportLease, type ExportModuleReceipt } from '../export-dispatcher.ts';
// Same existing D2 domain port shape; no second job/lease/encryption engine.
export type ProfileDomainRPC = (action: string, input: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>;
const ttl = (row: Record<string, unknown>, now: number) => positive(row.receivedAt) && row.receivedAt <= now
  && positive(row.expiresAt) && row.expiresAt > now && row.expiresAt > row.receivedAt && row.expiresAt <= row.receivedAt + TTL;
const sorted = (rows: unknown, key: string, validate: (row: Record<string, unknown>) => boolean): rows is Record<string, unknown>[] => {
  if (!Array.isArray(rows) || rows.length > 10000) return false;
  let previous = '';
  for (const row of rows) { if (!record(row) || !uuid(row[key]) || String(row[key]) <= previous || !validate(row)) return false; previous = String(row[key]); }
  return true;
};
/** Typed suffix, not a generic JSON arm. Latest fences/journal are independently
 * requalified by SQL at D2 page, commit and download; a backup cannot self-prove. */
export function validMeasurementMetadata(v: unknown, now: number): v is Record<string, unknown> {
  if (!record(v) || !exact(v, ['schemaVersion', 'purpose', 'consents', 'admissions', 'reports', 'fences', 'sourceRows'])
    || v.schemaVersion !== SCHEMA || v.purpose !== PURPOSE || !record(v.sourceRows) || !exact(v.sourceRows, ['consents', 'admissions', 'reports', 'fences'])) return false;
  if (!sorted(v.consents, 'id', c => exact(c, ['id', 'noticeVersion', 'entries', 'receivedAt', 'expiresAt']) && c.noticeVersion === NOTICE
    && ttl(c, now) && Array.isArray(c.entries) && c.entries.length > 0 && c.entries.length <= 3
    && c.entries.every((e, i) => ENTRIES.includes(e) && (i === 0 || ENTRIES.indexOf((c.entries as typeof ENTRIES[number][])[i - 1]) < ENTRIES.indexOf(e))))) return false;
  if (!sorted(v.admissions, 'id', a => exact(a, ['id', 'consentId', 'entry', 'source', 'admittedAt', 'firstEver', 'receivedAt', 'expiresAt'])
    && uuid(a.consentId) && ENTRIES.includes(a.entry as typeof ENTRIES[number]) && source(a.source) && ttl(a, now)
    && (a.admittedAt === null || positive(a.admittedAt) && a.admittedAt <= now) && ['proven', 'unknown'].includes(String(a.firstEver)))) return false;
  if (!sorted(v.reports, 'id', r => exact(r, ['id', 'admissionId', 'consentId', 'signal', 'clock', 'receivedAt', 'expiresAt'])
    && uuid(r.admissionId) && uuid(r.consentId) && signal(r.signal) && clock(r.clock) && ttl(r, now))) return false;
  if (!sorted(v.fences, 'id', f => exact(f, ['id', 'state', 'receivedAt', 'expiresAt']) && f.state === 'erased' && ttl(f, now))) return false;
  const consents = new Map(v.consents.map(c => [c.id, c])); const admissions = new Map(v.admissions.map(a => [a.id, a]));
  for (const a of v.admissions) { const c = consents.get(a.consentId); if (!c || !(c.entries as unknown[]).includes(a.entry)
    || Number(a.receivedAt) < Number(c.receivedAt) || Number(a.expiresAt) > Number(c.expiresAt)) return false; }
  for (const r of v.reports) { const a = admissions.get(r.admissionId); if (!a || r.consentId !== a.consentId
    || Number(r.receivedAt) < Number(a.receivedAt) || Number(r.expiresAt) > Number(a.expiresAt)) return false; }
  return ['consents', 'admissions', 'reports', 'fences'].every(k => (v.sourceRows as Record<string, unknown>)[k] === (v[k] as unknown[]).length)
    && Object.values(v.sourceRows).every(natural) && Object.values(v.sourceRows).reduce<number>((n, x) => n + Number(x), 0) <= 10000;
}
export const EXTENDED_PROFILE_SCHEMA = 'profile-core-export/2' as const;
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
      if (record(value) && value.schemaVersion === 'profile-core-export/1') {
        const original = decodeProfileExportPage(value, limit, lease.ownerId, now());
        if (!original || abort.aborted) throw Error('MEASUREMENT_SOURCE_UNAVAILABLE');
        const encoded = exportCanonical({ snapshot: original.items }); const digest = createHash('sha256').update(encoded).digest('hex');
        if (digest !== original.sourceDigest || captured && captured.encoded !== encoded) throw Error('MEASUREMENT_SOURCE_CHANGED');
        captured = { encoded, digest, limit }; return { items: original.items, hasMore: false, nextCursor: null, sectionComplete: true };
      }
      if (!record(value) || value.schemaVersion !== EXTENDED_PROFILE_SCHEMA || !Array.isArray(value.items) || value.items.length !== 1
        || !hash(value.sourceDigest) || Buffer.byteLength(JSON.stringify(value)) > 1_000_000) throw Error('MEASUREMENT_SOURCE_UNAVAILABLE');
      const item = value.items[0];
      if (!record(item) || !exact(item, ['ownerId', 'profile', 'watermark', 'operations', 'sourceRows', 'measurement'])
        || item.ownerId !== lease.ownerId || !validMeasurementMetadata(item.measurement, now()) || !record(item.sourceRows)
        || !exact(item.sourceRows, ['profiles', 'watermarks', 'operations', 'measurement']) || !natural(item.sourceRows.measurement)) throw Error('MEASUREMENT_SOURCE_UNAVAILABLE');
      const actual = Object.values(item.measurement.sourceRows as Record<string, number>).reduce((n, x) => n + x, 0);
      if (actual !== item.sourceRows.measurement || Object.values(item.sourceRows).reduce<number>((n, x) => n + Number(x), 0) > 10000) throw Error('MEASUREMENT_CAPACITY');
      const { measurement: _measurement, ...original } = item;
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
