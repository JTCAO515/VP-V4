import type { CoverageInput, SelectedCommand, CoverageState } from '../coverage/contract.ts';
import { CONVERSATION_SCHEMA, CONVERSATION_BOUNDARIES, parseConversationCommand, conversationDigest } from './contract.ts';
import { decodeConversationPreview, decodeConversationReceipt, decodeConversationUnknown } from './protocol.ts';

/** Candidate descriptor; shared catalog is applied only under Main's precise lease. */
export const CONVERSATION_MODULE = {
  id: 'conversations', location: 'server' as const, version: CONVERSATION_SCHEMA, scope: CONVERSATION_SCHEMA,
  exportHandler: 'core', deleteHandler: 'conversation_data', selection: 'owner' as const,
  capacity: 'one explicitly selected owner conversation or standalone thread; bounded4100 graph/1MB; fixed30s source CAS; active/shared/independent domains rejected; own1..20 preview metadata exit',
  retention: [...new Set([...CONVERSATION_BOUNDARIES['conversation-sensitive-data/1'].retained, ...CONVERSATION_BOUNDARIES['conversation-delete-progress/1'].retained])],
  missing: [...new Set([...CONVERSATION_BOUNDARIES['conversation-sensitive-data/1'].missing, ...CONVERSATION_BOUNDARIES['conversation-delete-progress/1'].missing])],
};
export function validConversationCoverageSelection(input: CoverageInput, value: unknown): boolean {
  const command = parseConversationCommand(value);
  if (!command || command.action === 'list' || command.action === 'recover' || input.moduleId !== 'conversations' || input.moduleVersion !== CONVERSATION_SCHEMA
    || input.action !== 'delete' || input.tripId !== null || command.requestId !== input.operationId || Buffer.byteLength(input.commandBytes, 'utf8') > 8192) return false;
  if (input.phase === 'preview') return command.action === 'preview';
  return command.action === 'erase' && (input.phase === 'execute' || input.phase === 'recover')
    && Buffer.byteLength(conversationRecoveryBytes(input.commandBytes), 'utf8') <= 16384;
}
export function conversationRecoveryBytes(bytes: string): string {
  const command = parseConversationCommand(JSON.parse(bytes));
  if (!command || command.action !== 'erase') throw Error('INVALID_INPUT');
  return JSON.stringify({ action: 'recover', scope: command.scope, requestId: command.requestId, rootKind: command.rootKind,
    rootId: command.rootId, objectIds: command.objectIds, mutationBytes: bytes });
}
export function conversationCoverageRequestBody(input: CoverageInput): string {
  if (input.phase !== 'recover') return input.commandBytes;
  const command = parseConversationCommand(JSON.parse(input.commandBytes));
  if (!command || command.action !== 'erase' || !validConversationCoverageSelection(input, command)) throw Error('INVALID_INPUT');
  return conversationRecoveryBytes(input.commandBytes);
}
export function conversationCoverageOutcome(selected: SelectedCommand, data: unknown, now: number): Readonly<{ state: CoverageState; reason: string }> | null {
  const { input } = selected; const command = parseConversationCommand(selected.command);
  if (!command || command.action === 'list' || command.action === 'recover' || !validConversationCoverageSelection(input, command)) return null;
  const actor = { ownerId: input.actorId, sessionId: input.sessionId, mobileEpoch: input.mobileEpoch };
  if (command.action === 'preview') {
    const preview = decodeConversationPreview(data, command, actor, now);
    return preview ? { state: 'preview', reason: preview.eligible ? 'EXPLICIT_SELECTION_REQUIRED' : 'SELECTED_SOURCE_GRAPH_BLOCKED' } : null;
  }
  const digest = conversationDigest(input.commandBytes);
  if (decodeConversationReceipt(data, command, actor, digest, now)) return { state: 'scoped_complete', reason: command.scope === 'conversation-sensitive-data/1'
    ? 'SELECTED_CONVERSATION_ERASURE_WITH_DECLARED_RETENTION' : 'SELECTED_PREVIEW_ERASURE_WITH_PERMANENT_FENCES' };
  return input.phase === 'recover' && decodeConversationUnknown(data, command, actor, digest) ? { state: 'unknown', reason: 'CONVERSATION_ACK_UNKNOWN' } : null;
}
