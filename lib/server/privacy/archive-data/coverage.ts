import type { CoverageInput, SelectedCommand, CoverageState } from '../coverage/contract.ts';
import { ARCHIVE_SCHEMA, ARCHIVE_BOUNDARIES, parseArchiveCommand, archiveDigest } from './contract.ts';
import { decodeArchiveBundle, decodeArchivePreview, decodeArchiveReceipt, decodeArchiveUnknown } from './protocol.ts';

export const ARCHIVE_CATALOG_VERSION = 'data-coverage-catalog/2026-10-06.6' as const;
export const ARCHIVE_MODULE = {
  id: 'archive', location: 'server' as const, version: ARCHIVE_SCHEMA, scope: ARCHIVE_SCHEMA,
  exportHandler: 'archive_data', deleteHandler: 'archive_data', selection: 'trip' as const,
  capacity: 'one selected archived Trip/version; all available safe snapshots and Trip lifecycle receipts; 50/page, 402 pages, 20001 rows, 1MB; fixed30s; own progress inventory 1..20 selected metadata; original selected Trip deletion',
  retention: [...ARCHIVE_BOUNDARIES['archived-trip-data/1'].retained,...ARCHIVE_BOUNDARIES['archive-export-progress/1'].retained],
  missing: [...ARCHIVE_BOUNDARIES['archived-trip-data/1'].missing,...ARCHIVE_BOUNDARIES['archive-export-progress/1'].missing],
};
export function validArchiveCoverageSelection(input: CoverageInput, value: unknown): boolean {
  const command = parseArchiveCommand(value);
  if (!command || command.action === 'list' || command.action === 'recover' || command.action === 'validate' || input.moduleId !== 'archive'
    || input.moduleVersion !== ARCHIVE_SCHEMA || input.tripId !== command.tripId || command.requestId !== input.operationId
    || Buffer.byteLength(input.commandBytes, 'utf8') > 8192) return false;
  if (input.phase === 'preview') return command.action === 'preview';
  if (input.action === 'export') return input.phase === 'execute' && command.action === 'export';
  return input.action === 'delete' && command.action === 'erase' && (input.phase === 'execute' || input.phase === 'recover')
    && Buffer.byteLength(JSON.stringify({ action: 'recover', scope: command.scope, requestId: command.requestId,
      tripId: command.tripId, tripVersion: command.tripVersion, objectIds: command.objectIds, mutationBytes: input.commandBytes }), 'utf8') <= 16384;
}
export function archiveCoverageRequestBody(input: CoverageInput): string {
  if (input.phase !== 'recover') return input.commandBytes;
  const command = parseArchiveCommand(JSON.parse(input.commandBytes));
  if (!command || command.action !== 'erase' || !validArchiveCoverageSelection(input, command)) throw Error('INVALID_INPUT');
  return JSON.stringify({ action: 'recover', scope: command.scope, requestId: command.requestId, tripId: command.tripId, tripVersion: command.tripVersion,
    objectIds: command.objectIds, mutationBytes: input.commandBytes });
}
export function archiveCoverageOutcome(selected: SelectedCommand, data: unknown, now: number): Readonly<{ state: CoverageState; reason: string }> | null {
  const { input } = selected; const command = parseArchiveCommand(selected.command);
  if (!command || command.action === 'list' || command.action === 'recover' || command.action === 'validate' || !validArchiveCoverageSelection(input, command)) return null;
  const actor = { ownerId: input.actorId, sessionId: input.sessionId, mobileEpoch: input.mobileEpoch };
  if (command.action === 'preview') return decodeArchivePreview(data, command, actor, now) ? { state: 'preview', reason: 'EXPLICIT_SELECTION_REQUIRED' } : null;
  const digest = archiveDigest(input.commandBytes);
  if (command.action === 'export') {
    const bundle = decodeArchiveBundle(data, command, actor, now);
    return bundle?.requestDigest === digest && bundle.previewDigest === command.previewDigest ? { state: 'partial', reason: 'PROTECTED_ARCHIVE_FILE_REQUIRED' } : null;
  }
  const receipt = decodeArchiveReceipt(data, command, actor, digest, now);
  if (receipt?.previewDigest === command.previewDigest) return { state: 'scoped_complete', reason: 'SELECTED_PROGRESS_ERASURE_WITH_DECLARED_RETENTION' };
  return input.phase === 'recover' && decodeArchiveUnknown(data, command, actor, digest) ? { state: 'unknown', reason: 'ARCHIVE_ACK_UNKNOWN' } : null;
}
