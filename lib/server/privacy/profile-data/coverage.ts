import type { CoverageInput, SelectedCommand, CoverageState } from '../coverage/contract.ts';
import { PROFILE_SCHEMA, PROFILE_BOUNDARIES, parseProfileCommand, profileDigest } from './contract.ts';
import { decodeProfilePreview, decodeProfileReceipt, decodeProfileUnknown } from './protocol.ts';

/** Candidate descriptor; shared catalog is applied only under Main's precise lease. */
export const PROFILE_CATALOG_VERSION = 'data-coverage-catalog/2026-10-07.9' as const;
export const PROFILE_MODULE = {
  id: 'profile', location: 'server' as const, version: PROFILE_SCHEMA, scope: PROFILE_SCHEMA,
  exportHandler: 'core', deleteHandler: 'profile_data', selection: 'owner' as const,
  capacity: 'one explicitly selected owner Profile, all saved fields and pace history; fixed30s source CAS; declared mixed copies retained under original controls; own1..20 preview metadata exit',
  retention: [...new Set([...PROFILE_BOUNDARIES['profile-sensitive-data/1'].retained, ...PROFILE_BOUNDARIES['profile-delete-progress/1'].retained])],
  missing: [...new Set([...PROFILE_BOUNDARIES['profile-sensitive-data/1'].missing, ...PROFILE_BOUNDARIES['profile-delete-progress/1'].missing])],
};
export function validProfileCoverageSelection(input: CoverageInput, value: unknown): boolean {
  const command = parseProfileCommand(value);
  if (!command || command.action === 'list' || command.action === 'recover' || input.moduleId !== 'profile' || input.moduleVersion !== PROFILE_SCHEMA
    || input.action !== 'delete' || input.tripId !== null || command.requestId !== input.operationId || Buffer.byteLength(input.commandBytes, 'utf8') > 8192) return false;
  if (input.phase === 'preview') return command.action === 'preview';
  return command.action === 'erase' && (input.phase === 'execute' || input.phase === 'recover')
    && Buffer.byteLength(profileRecoveryBytes(input.commandBytes), 'utf8') <= 16384;
}
export function profileRecoveryBytes(bytes: string): string {
  const command = parseProfileCommand(JSON.parse(bytes));
  if (!command || command.action !== 'erase') throw Error('INVALID_INPUT');
  return JSON.stringify({ action: 'recover', scope: command.scope, requestId: command.requestId, profileId: command.profileId, objectIds: command.objectIds, mutationBytes: bytes });
}
export function profileCoverageRequestBody(input: CoverageInput): string {
  if (input.phase !== 'recover') return input.commandBytes;
  const command = parseProfileCommand(JSON.parse(input.commandBytes));
  if (!command || command.action !== 'erase' || !validProfileCoverageSelection(input, command)) throw Error('INVALID_INPUT');
  return profileRecoveryBytes(input.commandBytes);
}
export function profileCoverageOutcome(selected: SelectedCommand, data: unknown, now: number): Readonly<{ state: CoverageState; reason: string }> | null {
  const { input } = selected; const command = parseProfileCommand(selected.command);
  if (!command || command.action === 'list' || command.action === 'recover' || !validProfileCoverageSelection(input, command)) return null;
  const actor = { ownerId: input.actorId, sessionId: input.sessionId, mobileEpoch: input.mobileEpoch };
  if (command.action === 'preview') {
    const preview = decodeProfilePreview(data, command, actor, now);
    return preview ? { state: 'preview', reason: preview.eligible ? 'EXPLICIT_SELECTION_REQUIRED' : 'SELECTED_SOURCE_GRAPH_BLOCKED' } : null;
  }
  const digest = profileDigest(input.commandBytes);
  if (decodeProfileReceipt(data, command, actor, digest, now)) return { state: 'scoped_complete', reason: command.scope === 'profile-sensitive-data/1'
    ? 'SELECTED_PROFILE_CLEAR_WITH_DECLARED_RETENTION' : 'SELECTED_PREVIEW_ERASURE_WITH_PERMANENT_FENCES' };
  return input.phase === 'recover' && decodeProfileUnknown(data, command, actor, digest) ? { state: 'unknown', reason: 'PROFILE_ACK_UNKNOWN' } : null;
}
