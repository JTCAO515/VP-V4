import type { CoverageInput, SelectedCommand, CoverageState } from '../coverage/contract.ts';
import { COVERAGE_PROGRESS_SCHEMA, COVERAGE_PROGRESS_BOUNDARIES, parseCoverageProgressCommand, coverageProgressDigest } from './contract.ts';
import { decodeCoverageProgressBundle, decodeCoverageProgressPreview, decodeCoverageProgressReceipt, decodeCoverageProgressUnknown } from './protocol.ts';

export const COVERAGE_PROGRESS_CATALOG_VERSION = 'data-coverage-catalog/2026-10-06.5' as const;
export const COVERAGE_PROGRESS_MODULE = {
  id: 'coverage_progress', location: 'server' as const, version: COVERAGE_PROGRESS_SCHEMA, scope: COVERAGE_PROGRESS_SCHEMA,
  exportHandler: 'coverage_progress', deleteHandler: 'coverage_progress', selection: 'coverage_records' as const,
  capacity: '1..20 selected owner collector/exit requests; all metadata/fence preview; exact bytes/source CAS; 5/page, 4 pages, 1MB; fixed30s; selected transient erasure',
  retention: [...COVERAGE_PROGRESS_BOUNDARIES[COVERAGE_PROGRESS_SCHEMA].retained],
  missing: [...COVERAGE_PROGRESS_BOUNDARIES[COVERAGE_PROGRESS_SCHEMA].missing],
};

export function validCoverageProgressCoverageSelection(input: CoverageInput, value: unknown): boolean {
  const command = parseCoverageProgressCommand(value);
  if (!command || command.action === 'list' || command.action === 'recover' || input.tripId !== null
    || input.moduleVersion !== COVERAGE_PROGRESS_SCHEMA || command.requestId !== input.operationId
    || command.scope !== COVERAGE_PROGRESS_SCHEMA || input.moduleId !== 'coverage_progress'
    || Buffer.byteLength(input.commandBytes, 'utf8') > 8192) return false;
  if (input.phase === 'preview') return command.action === 'preview';
  if (input.action === 'export') return input.phase === 'execute' && command.action === 'export';
  return input.action === 'delete' && command.action === 'erase' && (input.phase === 'execute' || input.phase === 'recover')
    && Buffer.byteLength(JSON.stringify({ action: 'recover', scope: command.scope, requestId: command.requestId,
      objectIds: command.objectIds, mutationBytes: input.commandBytes }), 'utf8') <= 16384;
}
export function coverageProgressCoverageRequestBody(input: CoverageInput): string {
  if (input.phase !== 'recover') return input.commandBytes;
  const command = parseCoverageProgressCommand(JSON.parse(input.commandBytes));
  if (!command || command.action !== 'erase' || !validCoverageProgressCoverageSelection(input, command)) throw Error('INVALID_INPUT');
  return JSON.stringify({ action: 'recover', scope: command.scope, requestId: command.requestId, objectIds: command.objectIds, mutationBytes: input.commandBytes });
}
export function coverageProgressCoverageOutcome(selected: SelectedCommand, data: unknown, now: number): Readonly<{ state: CoverageState; reason: string }> | null {
  const { input } = selected; const command = parseCoverageProgressCommand(selected.command);
  if (!command || command.action === 'list' || command.action === 'recover' || !validCoverageProgressCoverageSelection(input, command)) return null;
  const actor = { ownerId: input.actorId, sessionId: input.sessionId, mobileEpoch: input.mobileEpoch };
  if (command.action === 'preview') return decodeCoverageProgressPreview(data, command, actor, now) ? { state: 'preview', reason: 'EXPLICIT_SELECTION_REQUIRED' } : null;
  const digest = coverageProgressDigest(input.commandBytes);
  if (command.action === 'export') {
    const bundle = decodeCoverageProgressBundle(data, command, actor, now);
    return bundle?.requestDigest === digest && bundle.previewDigest === command.previewDigest ? { state: 'scoped_complete', reason: 'SELECTED_PROGRESS_METADATA_WITH_DECLARED_RETENTION' } : null;
  }
  const receipt = decodeCoverageProgressReceipt(data, command, actor, digest, now);
  if (receipt?.previewDigest === command.previewDigest) return { state: 'scoped_complete', reason: 'SELECTED_ERASURE_WITH_DECLARED_RETENTION' };
  return input.phase === 'recover' && decodeCoverageProgressUnknown(data, command, actor, digest) ? { state: 'unknown', reason: 'COVERAGE_PROGRESS_ACK_UNKNOWN' } : null;
}
