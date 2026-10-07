import type { CoverageInput, SelectedCommand, CoverageState } from '../coverage/contract.ts';
import { TURN_SCHEMA, TURN_BOUNDARIES, parseTurnCommand, turnDigest } from './contract.ts';
import { decodeTurnPreview, decodeTurnReceipt, decodeTurnUnknown } from './protocol.ts';

/** Candidate descriptor; shared catalog is applied only under Main's precise lease. */
export const TURN_CATALOG_VERSION = 'data-coverage-catalog/2026-10-07.11' as const;
export const TURN_MODULE = {
  id: 'turn', location: 'server' as const, version: TURN_SCHEMA, scope: TURN_SCHEMA,
  exportHandler: 'core', deleteHandler: 'turn_data', selection: 'owner' as const,
  capacity: 'one explicitly selected completed owner Turn; bounded4100 graph/1MB; fixed30s source CAS; active/shared/independent domains rejected; own1..20 preview metadata exit',
  retention: [...new Set([...TURN_BOUNDARIES['turn-sensitive-data/1'].retained, ...TURN_BOUNDARIES['turn-delete-progress/1'].retained])],
  missing: [...new Set([...TURN_BOUNDARIES['turn-sensitive-data/1'].missing, ...TURN_BOUNDARIES['turn-delete-progress/1'].missing])],
};
export function validTurnCoverageSelection(input: CoverageInput, value: unknown): boolean {
  const command = parseTurnCommand(value);
  if (!command || command.action === 'list' || command.action === 'recover' || input.moduleId !== 'turn' || input.moduleVersion !== TURN_SCHEMA
    || input.action !== 'delete' || input.tripId !== null || command.requestId !== input.operationId || Buffer.byteLength(input.commandBytes, 'utf8') > 8192) return false;
  if (input.phase === 'preview') return command.action === 'preview';
  return command.action === 'erase' && (input.phase === 'execute' || input.phase === 'recover')
    && Buffer.byteLength(turnRecoveryBytes(input.commandBytes), 'utf8') <= 16384;
}
export function turnRecoveryBytes(bytes: string): string {
  const command = parseTurnCommand(JSON.parse(bytes));
  if (!command || command.action !== 'erase') throw Error('INVALID_INPUT');
  return JSON.stringify({ action: 'recover', scope: command.scope, requestId: command.requestId, turnId: command.turnId, objectIds: command.objectIds, mutationBytes: bytes });
}
export function turnCoverageRequestBody(input: CoverageInput): string {
  if (input.phase !== 'recover') return input.commandBytes;
  const command = parseTurnCommand(JSON.parse(input.commandBytes));
  if (!command || command.action !== 'erase' || !validTurnCoverageSelection(input, command)) throw Error('INVALID_INPUT');
  return turnRecoveryBytes(input.commandBytes);
}
export function turnCoverageOutcome(selected: SelectedCommand, data: unknown, now: number): Readonly<{ state: CoverageState; reason: string }> | null {
  const { input } = selected; const command = parseTurnCommand(selected.command);
  if (!command || command.action === 'list' || command.action === 'recover' || !validTurnCoverageSelection(input, command)) return null;
  const actor = { ownerId: input.actorId, sessionId: input.sessionId, mobileEpoch: input.mobileEpoch };
  if (command.action === 'preview') {
    const preview = decodeTurnPreview(data, command, actor, now);
    return preview ? { state: 'preview', reason: preview.eligible ? 'EXPLICIT_SELECTION_REQUIRED' : 'SELECTED_SOURCE_GRAPH_BLOCKED' } : null;
  }
  const digest = turnDigest(input.commandBytes);
  if (decodeTurnReceipt(data, command, actor, digest, now)) return { state: 'scoped_complete', reason: command.scope === 'turn-sensitive-data/1'
    ? 'SELECTED_TURN_ERASURE_WITH_DECLARED_RETENTION' : 'SELECTED_PREVIEW_ERASURE_WITH_PERMANENT_FENCES' };
  return input.phase === 'recover' && decodeTurnUnknown(data, command, actor, digest) ? { state: 'unknown', reason: 'TURN_ACK_UNKNOWN' } : null;
}
