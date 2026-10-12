import { createHash } from 'node:crypto';
import { SCHEMA, PURPOSE, NOTICE, TTL, ENTRIES, record, exact, uuid, positive, natural, hash, source, signal, clock } from '../../journey-entry/experience-measurement/contract.ts';
import { decodeProfileExportPage } from '../profile-export/contract.ts';
import { exportCanonical, type ExportHandler, type ExportLease, type ExportModuleReceipt } from '../export-dispatcher.ts';
// Same existing D2 domain port shape; no second job/lease/encryption engine.
export type ProfileDomainRPC = (action: string, input: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>;
import { validMeasurementMetadata, MEASUREMENT_ROW_COUNTS } from './rows.ts';
export { validMeasurementMetadata, MEASUREMENT_ROW_COUNTS } from './rows.ts';
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
        || item.ownerId !== lease.ownerId || !validMeasurementMetadata(item.journeyMeasurement, now(), lease.ownerId, lease.requestId) || !record(item.sourceRows)
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
