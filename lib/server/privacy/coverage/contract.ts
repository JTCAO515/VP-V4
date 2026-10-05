import { createHash } from 'node:crypto';
import { CATALOG_VERSION, moduleById } from './catalog.ts';
import { record, exact, uuid } from '../../guide/contract.ts';
import { parseCommunityInput } from '../../community/contract.ts';
import { parseSafetyInput } from '../../community/safety/contract.ts';
import { parsePublicationInput } from '../../community/publication/contract.ts';
import { parseBriefInput } from '../../service-cases/brief/contract.ts';
import { parseServiceDataInput } from '../../service-cases/operations/data-contract.ts';
import { parseGuideCommand } from '../../guide/contract.ts';
import { linkedTripCommand } from '../linked-trip/contract.ts';
import { memoryDeleteCommand } from '../memory-delete/contract.ts';
import { validMaterialCoverageSelection } from '../material-references/coverage.ts';
import { validNotificationDataCoverageSelection } from '../notification-data/coverage.ts';
import { validArchiveCoverageSelection } from '../archive-data/coverage.ts';
import { validCoverageProgressCoverageSelection } from '../coverage-progress/coverage.ts';

export const COVERAGE_SCHEMA = 'data-coverage/1' as const;
export const coverageDigest = (bytes: string) => createHash('sha256').update(bytes, 'utf8').digest('hex');
export type CoverageInput = Readonly<{
  schemaVersion: typeof COVERAGE_SCHEMA; catalogVersion: typeof CATALOG_VERSION;
  actorId: string; sessionId: string; mobileEpoch: number; moduleId: string; moduleVersion: string;
  operationId: string; action: 'export' | 'delete'; phase: 'execute' | 'recover' | 'preview';
  confirmed: true; tripId: string | null; commandBytes: string;
}>;
export type CoverageState = 'scoped_complete' | 'queued' | 'partial' | 'unknown' | 'unavailable' | 'preview';
export type CoverageResult = Omit<CoverageInput, 'confirmed' | 'tripId' | 'commandBytes'> & Readonly<{
  requestDigest: string; state: CoverageState; reason: string; result: unknown; allUserDataCompleted: false;
}>;
export type SelectedCommand = Readonly<{ input: CoverageInput; command: Record<string, unknown>; handler: string | null }>;

/** Closed registry selection; caller cannot supply an endpoint, RPC, owner or lease. */
export function parseCoverageInput(value: unknown): SelectedCommand | null {
  if (!record(value) || !exact(value, ['schemaVersion','catalogVersion','actorId','sessionId','mobileEpoch','moduleId','moduleVersion','operationId','action','phase','confirmed','tripId','commandBytes'])
    || value.schemaVersion !== COVERAGE_SCHEMA || value.catalogVersion !== CATALOG_VERSION
    || ![value.actorId,value.sessionId,value.operationId].every(uuid)
    || !Number.isSafeInteger(value.mobileEpoch) || Number(value.mobileEpoch) < 1
    || typeof value.moduleId !== 'string' || typeof value.moduleVersion !== 'string'
    || !['export','delete'].includes(String(value.action)) || !['execute','recover','preview'].includes(String(value.phase))
    || value.confirmed !== true || !(value.tripId === null || uuid(value.tripId))
    || typeof value.commandBytes !== 'string' || Buffer.byteLength(value.commandBytes, 'utf8') > 150000) return null;
  const module = moduleById(value.moduleId);
  if (!module || module.version !== value.moduleVersion || module.location !== 'server') return null;
  let command: unknown; try { command = JSON.parse(value.commandBytes); } catch { return null; }
  if (!record(command)) return null;
  const input = value as CoverageInput;
  const handler = input.action === 'export' ? module.exportHandler : module.deleteHandler;
  if (handler === null) return exact(command, []) && input.tripId === null && input.phase === 'execute' ? { input, command, handler } : null;
  // A stable module key may resolve to different existing commands for export/delete.
  if ('operationId' in command && command.operationId !== input.operationId || 'requestId' in command && command.requestId !== input.operationId) return null;
  if (handler === 'materials') return validMaterialCoverageSelection(input, command) ? { input, command, handler } : null;
  if (handler === 'coverage_progress') return validCoverageProgressCoverageSelection(input, command) ? { input, command, handler } : null;
  if (handler === 'notification_data') return validNotificationDataCoverageSelection(input, command) ? { input, command, handler } : null;
  if (handler === 'core') return input.tripId === null && input.phase !== 'preview'
    && exact(command, ['requestId','confirmed']) && command.requestId === input.operationId && command.confirmed === true ? { input, command, handler } : null;
  if (handler === 'archive_data' && !(input.action === 'delete' && uuid(input.tripId))) return validArchiveCoverageSelection(input, command) ? { input, command, handler } : null;
  if (handler === 'trip' || handler === 'archive_data') {
    if (!uuid(input.tripId)) return null;
    if (linkedTripCommand(command as unknown)) return (input.phase === 'preview' ? command.action === 'preview' && command.tripId === input.tripId : command.action === 'confirm')
      ? { input, command, handler: 'linked_trip' } : null;
    return input.phase !== 'preview' && exact(command, ['requestId','tripId','expectedVersion','confirmed'])
      && command.requestId === input.operationId && command.tripId === input.tripId && Number.isSafeInteger(command.expectedVersion)
      && Number(command.expectedVersion) >= 0 && command.confirmed === true ? { input, command, handler: 'trip' } : null;
  }
  if (handler === 'memory') return input.tripId === null && memoryDeleteCommand(command)
    && (input.phase === 'preview' ? command.action === 'preview' : command.action === 'confirm') ? { input, command, handler } : null;
  if (handler === 'guide') {
    const parsed = parseGuideCommand(command);
    return uuid(input.tripId) && parsed && input.phase === 'execute' && parsed.action === (input.action === 'export' ? 'export' : 'forget') ? { input, command, handler } : null;
  }
  if (handler === 'notifications' || handler === 'lifecycle') return input.action === 'export' && input.phase === 'execute' && input.tripId === null
    && exact(command, ['action','requestId','confirmed']) && command.action === 'export' && command.requestId === input.operationId && command.confirmed === true ? { input, command, handler } : null;
  if (input.tripId !== null || input.phase === 'preview') return null;
  const parsed = handler === 'ugc' ? parseCommunityInput(command) : handler === 'safety' ? parseSafetyInput(command)
    : handler === 'publication' ? parsePublicationInput(command) : handler === 'brief' ? parseBriefInput(command)
      : handler === 'case' ? parseServiceDataInput(command) : null;
  return parsed && parsed.action === input.action && (input.action !== 'export' || input.phase === 'execute') ? { input, command, handler } : null;
}

export function coverageResult(input: CoverageInput, raw: string, state: CoverageState, reason: string, result: unknown = null): CoverageResult {
  const { confirmed: _confirmed, tripId: _tripId, commandBytes: _commandBytes, ...binding } = input;
  return { ...binding, requestDigest: coverageDigest(raw), state, reason, result, allUserDataCompleted: false };
}
