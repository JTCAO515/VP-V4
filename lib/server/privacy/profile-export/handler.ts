import { createHash } from 'node:crypto';
import { exportCanonical, type ExportHandler, type ExportLease, type ExportModuleReceipt, type ExportPage } from '../export-dispatcher.ts';
import type { ExportDomainRPC } from '../export-worker.ts';
import { identifier } from '../profile-data/contract.ts';
import { decodeProfileExportPage, PROFILE_EXPORT_SECTIONS } from './contract.ts';

export type ProfileExportHandler = ExportHandler & {
  progress: () => { pages: number; rows: number; terminalSections: number };
  matchesReceipt: (receipt: ExportModuleReceipt | undefined) => boolean;
};

/** SQL requalifies the entire source digest atomically at original D2 commit and download. */
export function profileExportHandler(lease: ExportLease, domain: ExportDomainRPC, now: () => number = Date.now): ProfileExportHandler {
  if (![lease.requestId, lease.ownerId, lease.leaseId].every(identifier) || !Number.isSafeInteger(lease.generation) || lease.generation < 1)
    throw Error('Profile export unavailable');
  let captured: { encoded: string; sourceDigest: string; limit: number } | null = null;
  return {
    sections: PROFILE_EXPORT_SECTIONS, consistency: 'snapshot',
    progress: () => ({ pages: captured ? 1 : 0, rows: captured ? 1 : 0, terminalSections: captured ? 1 : 0 }),
    matchesReceipt: receipt => !!receipt && receipt.module === 'profile' && (captured
      ? receipt.status === 'complete' && receipt.reason === 'NONE' && receipt.pages === 1 && receipt.rows === 1 && receipt.digest === captured.sourceDigest
      : receipt.pages === 0 && receipt.rows === 0 && receipt.status !== 'complete' && receipt.reason !== 'NONE'),
    page: async (section, cursor, limit, signal): Promise<ExportPage> => {
      if (section !== 'snapshot' || cursor !== null || !Number.isSafeInteger(limit) || limit < 1 || limit > 100
        || signal.aborted || captured && captured.limit !== limit) throw Error('Profile export unavailable');
      const value = await domain('profile_page', { requestId: lease.requestId, leaseId: lease.leaseId,
        generation: lease.generation, section, cursor, limit }, signal);
      const decoded = decodeProfileExportPage(value, limit, lease.ownerId, now());
      if (!decoded || signal.aborted) throw Error('Profile export unavailable');
      // Exactly the existing dispatcher's digest of Profile sections, not the naked snapshot item.
      const encoded = exportCanonical({ snapshot: decoded.items });
      const sourceDigest = createHash('sha256').update(encoded, 'utf8').digest('hex');
      if (sourceDigest !== decoded.sourceDigest || captured && captured.encoded !== encoded) throw Error('Profile export unavailable');
      captured = { encoded, sourceDigest, limit };
      return { items: decoded.items, hasMore: false, nextCursor: null, sectionComplete: true };
    },
  };
}
