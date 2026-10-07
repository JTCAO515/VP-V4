import type { CoverageInput, SelectedCommand, CoverageState } from '../coverage/contract.ts';
import { RESULT_SCHEMA, RESULT_BOUNDARIES, parseResultCommand, resultDigest } from './contract.ts';
import { decodeResultPreview, decodeResultReceipt, decodeResultUnknown } from './protocol.ts';

/** Candidate descriptor; shared catalog is applied only under Main's precise lease. */
export const RESULT_CATALOG_VERSION = 'data-coverage-catalog/2026-10-07.8' as const;
export const RESULT_MODULE = {
  id: 'results', location: 'server' as const, version: RESULT_SCHEMA, scope: RESULT_SCHEMA,
  exportHandler: 'core', deleteHandler: 'result_data', selection: 'owner' as const,
  capacity: 'one explicitly selected owner artifact and all revisions/events; bounded4100 graph/1MB; fixed30s source CAS; active/shared/cross-result/domain copies rejected; own1..20 preview metadata exit',
  retention: [...new Set([...RESULT_BOUNDARIES['result-sensitive-data/1'].retained, ...RESULT_BOUNDARIES['result-delete-progress/1'].retained])],
  missing: [...new Set([...RESULT_BOUNDARIES['result-sensitive-data/1'].missing, ...RESULT_BOUNDARIES['result-delete-progress/1'].missing])],
};
export function validResultCoverageSelection(input: CoverageInput, value: unknown): boolean {
  const command = parseResultCommand(value);
  if (!command || command.action === 'list' || command.action === 'recover' || input.moduleId !== 'results' || input.moduleVersion !== RESULT_SCHEMA
    || input.action !== 'delete' || input.tripId !== null || command.requestId !== input.operationId || Buffer.byteLength(input.commandBytes, 'utf8') > 8192) return false;
  if (input.phase === 'preview') return command.action === 'preview';
  return command.action === 'erase' && (input.phase === 'execute' || input.phase === 'recover')
    && Buffer.byteLength(resultRecoveryBytes(input.commandBytes), 'utf8') <= 16384;
}
export function resultRecoveryBytes(bytes: string): string {
  const command = parseResultCommand(JSON.parse(bytes));
  if (!command || command.action !== 'erase') throw Error('INVALID_INPUT');
  return JSON.stringify({ action: 'recover', scope: command.scope, requestId: command.requestId, rootKind: command.rootKind,
    rootId: command.rootId, objectIds: command.objectIds, mutationBytes: bytes });
}
export function resultCoverageRequestBody(input: CoverageInput): string {
  if (input.phase !== 'recover') return input.commandBytes;
  const command = parseResultCommand(JSON.parse(input.commandBytes));
  if (!command || command.action !== 'erase' || !validResultCoverageSelection(input, command)) throw Error('INVALID_INPUT');
  return resultRecoveryBytes(input.commandBytes);
}
export function resultCoverageOutcome(selected: SelectedCommand, data: unknown, now: number): Readonly<{ state: CoverageState; reason: string }> | null {
  const { input } = selected; const command = parseResultCommand(selected.command);
  if (!command || command.action === 'list' || command.action === 'recover' || !validResultCoverageSelection(input, command)) return null;
  const actor = { ownerId: input.actorId, sessionId: input.sessionId, mobileEpoch: input.mobileEpoch };
  if (command.action === 'preview') {
    const preview = decodeResultPreview(data, command, actor, now);
    return preview ? { state: 'preview', reason: preview.eligible ? 'EXPLICIT_SELECTION_REQUIRED' : 'SELECTED_SOURCE_GRAPH_BLOCKED' } : null;
  }
  const digest = resultDigest(input.commandBytes);
  if (decodeResultReceipt(data, command, actor, digest, now)) return { state: 'scoped_complete', reason: command.scope === 'result-sensitive-data/1'
    ? 'SELECTED_RESULT_ERASURE_WITH_DECLARED_RETENTION' : 'SELECTED_PREVIEW_ERASURE_WITH_PERMANENT_FENCES' };
  return input.phase === 'recover' && decodeResultUnknown(data, command, actor, digest) ? { state: 'unknown', reason: 'RESULT_ACK_UNKNOWN' } : null;
}
