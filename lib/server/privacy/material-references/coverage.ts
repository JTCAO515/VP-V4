import type { CoverageInput, SelectedCommand, CoverageState } from '../coverage/contract.ts';
import { parseMaterialCommand, materialDigest, type MaterialScope } from './contract.ts';
import { decodeMaterialBundle, decodeMaterialPreview, decodeMaterialReceipt, decodeMaterialUnknown } from './protocol.ts';

const moduleScopes: Readonly<Record<string, MaterialScope>> = {
  order_references: 'reservation-reference-data/1', pdf_intake: 'pdf-intake-data/1', material_exit_progress: 'material-exit-progress/1',
};
/** A catalog ID narrows one exact owner scope; it never conveys a bulk-data authority. */
export function validMaterialCoverageSelection(input: CoverageInput, value: unknown): boolean {
  const command = parseMaterialCommand(value);
  return !!command && command.action !== 'list' && command.action !== 'recover' && command.requestId === input.operationId
    && command.tripId === input.tripId && command.scope === moduleScopes[input.moduleId]
    && (input.phase === 'preview' ? command.action === 'preview' : input.action === 'export' ? input.phase === 'execute' && command.action === 'export' : command.action === 'erase');
}
/** Recovery preserves exact original opaque erase bytes, including whitespace. */
export function materialCoverageRequestBody(input: CoverageInput): string {
  if (input.phase !== 'recover') return input.commandBytes;
  const command = parseMaterialCommand(JSON.parse(input.commandBytes));
  if (!command || command.action !== 'erase' || !validMaterialCoverageSelection(input, command)) throw Error('INVALID_INPUT');
  return JSON.stringify({ action: 'recover', scope: command.scope, requestId: command.requestId, tripId: command.tripId,
    objectIds: command.objectIds, mutationBytes: input.commandBytes });
}
export function materialCoverageOutcome(selected: SelectedCommand, data: unknown, now: number): Readonly<{ state: CoverageState; reason: string }> | null {
  const { input } = selected; const command = parseMaterialCommand(selected.command);
  if (!command || command.action === 'list' || command.action === 'recover' || !validMaterialCoverageSelection(input, command)) return null;
  const actor = { ownerId: input.actorId, sessionId: input.sessionId, mobileEpoch: input.mobileEpoch };
  if (command.action === 'preview') return decodeMaterialPreview(data, command, actor, now) ? { state: 'preview', reason: 'EXPLICIT_SELECTION_REQUIRED' } : null;
  const digest = materialDigest(input.commandBytes);
  if (command.action === 'export') {
    const bundle = decodeMaterialBundle(data, command, actor, now);
    return bundle?.requestDigest === digest && bundle.previewDigest === command.previewDigest ? { state: 'scoped_complete', reason: 'SELECTED_METADATA_ONLY' } : null;
  }
  const receipt = decodeMaterialReceipt(data, command, actor, digest, now);
  if (receipt?.previewDigest === command.previewDigest) return { state: 'scoped_complete', reason: 'SELECTED_ERASURE_WITH_DECLARED_RETENTION' };
  return input.phase === 'recover' && decodeMaterialUnknown(data, command, actor, digest) ? { state: 'unknown', reason: 'MATERIAL_ACK_UNKNOWN' } : null;
}
