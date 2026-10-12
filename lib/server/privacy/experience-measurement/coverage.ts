import { createHash } from 'node:crypto';
import type { CoverageInput, SelectedCommand, CoverageState } from '../coverage/contract.ts';
import { SCHEMA, parseCommand, record, type Actor } from '../../journey-entry/experience-measurement/contract.ts';
import { decode, validErasureLifecycle } from '../../journey-entry/experience-measurement/protocol.ts';
export const MEASUREMENT_MODULE = {
  id: 'journey_measurement', location: 'server' as const, version: SCHEMA, scope: SCHEMA,
  exportHandler: 'core', deleteHandler: 'journey_measurement', selection: 'owner' as const,
  capacity: 'owner typed Profile D2 suffix; 10000 actual rows combined, 1MB snapshot; explicit 30s source CAS erasure',
  retention: ['bounded_content_free_erasure_fences'],
  missing: ['independent_restore_journal_required', 'device_observer_receipt_required', 'external_downloaded_copies_not_recallable'],
};
/** Shared registry registration remains a candidate. This function is a closed
 * owner scope, never the existing Profile-sensitive deletion scope. */
export function validMeasurementCoverageSelection(input: CoverageInput, value: unknown): boolean {
  const c = parseCommand(value);
  return !!c && input.moduleId === MEASUREMENT_MODULE.id && input.moduleVersion === SCHEMA && input.action === 'delete'
    && input.tripId === null && 'operationId' in c && c.operationId === input.operationId
    && Buffer.byteLength(input.commandBytes) <= 4096 && (input.phase === 'preview' ? c.action === 'preview' : c.action === 'erase');
}
export function measurementCoverageRequestBody(input: CoverageInput): string {
  const c = parseCommand(JSON.parse(input.commandBytes));
  if (!validMeasurementCoverageSelection(input, c)) throw Error('INVALID_INPUT');
  return input.phase === 'recover' ? JSON.stringify({ schemaVersion: SCHEMA, purpose: 'journey_experience_measurement',
    action: 'recover', operationId: input.operationId, mutationBytes: input.commandBytes }) : input.commandBytes;
}
export function measurementCoverageOutcome(selected: SelectedCommand, value: unknown, now: number): Readonly<{ state: CoverageState; reason: string }> | null {
  const { input } = selected; const c = parseCommand(selected.command);
  if (!c || !validMeasurementCoverageSelection(input, selected.command)) return null;
  const actor: Actor = { ownerId: input.actorId, sessionId: input.sessionId, mobileEpoch: input.mobileEpoch };
  const receipt = decode(value, c, actor, now, createHash('sha256').update(input.commandBytes).digest('hex'));
  if (!receipt) return null;
  return receipt.kind === 'preview' ? { state: 'preview', reason: 'EXPLICIT_MEASUREMENT_ERASURE_REQUIRED' }
    : record(receipt) && receipt.kind === 'erasure' && validErasureLifecycle(receipt.lifecycle) ? receipt.lifecycle.state === 'complete'
      ? { state: 'scoped_complete', reason: 'MEASUREMENT_ERASED_CONSENT_REVOKED' }
      : { state: 'partial', reason: 'MEASUREMENT_ERASED_COPY_OR_CONTROL_LIFECYCLE_INCOMPLETE' } : null;
}
