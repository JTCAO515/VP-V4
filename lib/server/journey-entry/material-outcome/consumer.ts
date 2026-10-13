import { parsePdfCommand, pdfDigest, object, exact, sha256, uuid, integer } from '../../intake/pdf/contract.ts';
import { parsePdfOperation, pdfRequestDigest } from '../../intake/pdf/repository.ts';
import { assertTripSnapshot } from '../../trip/patch/contract.ts';
import { parseClosedJSON } from './json.ts';
import { actor, source, selection, denied, type Actor, type MaterialSource, type Association } from './contract.ts';

/** Ports are supplied by original source owners, never decoded from an HTTP caller.
 * Missing protected selection lineage must return null. No admission/consent is created. */
export interface OriginalMaterialReads {
  readActor(signal: AbortSignal): Promise<unknown>;
  readSelection(logicalId: string, signal: AbortSignal): Promise<unknown>;
  readPdfOperation(tripId: string, operationId: string, actor: Actor, signal: AbortSignal): Promise<unknown>;
  readTrip(tripId: string, signal: AbortSignal): Promise<unknown>;
}
export type TripReadback = Readonly<{ tripId: string; snapshot: unknown; confirmationState: 'confirmed' | 'initial' | 'unknown';
  versions: readonly Readonly<{ id: string; proposalId: string | null; resultingVersion: number; eventType: string }>[] }>;
function trip(v: unknown): v is TripReadback {
  if (!object(v) || !exact(v, ['tripId', 'snapshot', 'confirmationState', 'versions'])
    || !Array.isArray(v.versions) || v.versions.length > 64
    || Buffer.byteLength(JSON.stringify(v)) > 65536) return false;
  try { assertTripSnapshot(v.snapshot); } catch { return false; }
  return uuid(v.tripId) && ['confirmed', 'initial', 'unknown'].includes(String(v.confirmationState))
    && v.versions.every(e => object(e) && exact(e, ['id', 'proposalId', 'resultingVersion', 'eventType'])
      && (uuid(e.id) || e.id === `initial-${v.tripId}` && e.proposalId === null && e.resultingVersion === 0 && e.eventType === 'initial')
      && (e.proposalId === null || uuid(e.proposalId))
      && integer(e.resultingVersion, 0, Number.MAX_SAFE_INTEGER) && typeof e.eventType === 'string');
}

/** Eight sequential reads, <=15s, no retries, writes, retained state or metric sink.
 * Confirmation ACK loss is recoverable only through the same original operation read. */
export async function associateMaterialOutcome(requested: unknown, reads: OriginalMaterialReads | null,
  options: Readonly<{ signal: AbortSignal; now?: () => number; timeoutMs?: number }>): Promise<Association> {
  if (!source(requested)) return denied('invalid_source');
  // Screenshot has no original protected material-to-proposal lineage in the accepted source.
  if (!reads || requested.anchor.medium !== 'pdf') return denied('unobservable');
  const input: MaterialSource = structuredClone(requested);
  const now = options.now ?? Date.now;
  const timeout = options.timeoutMs ?? 15000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 15000) return denied('invalid_source');
  const expired = (expiresAt: string) => { const current = now(); return !Number.isFinite(current) || Date.parse(expiresAt) <= current; };
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, timeout);
  options.signal.addEventListener('abort', abort, { once: true });
  if (options.signal.aborted) abort();
  const signal = controller.signal;
  const read = <T>(work: () => Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const cancelled = () => reject(Error('unavailable'));
    if (signal.aborted) { cancelled(); return; }
    signal.addEventListener('abort', cancelled, { once: true });
    Promise.resolve().then(() => { if (signal.aborted) throw Error('unavailable'); return work(); }).then(value => {
      try { if (signal.aborted) cancelled(); else resolve(structuredClone(value)); } catch (error) { reject(error); }
    }, reject)
      .finally(() => signal.removeEventListener('abort', cancelled));
  });
  try {
    const identity = await read(() => reads.readActor(signal));
    if (!actor(identity)) return denied('actor_changed');
    const original = await read(() => reads.readSelection(input.logicalId, signal));
    if (!selection(original)) return denied('unobservable');
    if (pdfDigest(identity) !== pdfDigest(original.actor)) return denied('actor_changed');
    if (pdfDigest(input) !== pdfDigest(original.source)) return denied('binding_mismatch');
    if (expired(original.expiresAt)) return denied('source_expired');
    const body = parseClosedJSON(original.originalProposalBytes);
    if (!object(body) || !exact(body, ['command', 'reviewedPreviewDigest']) || !sha256(body.reviewedPreviewDigest)) return denied('binding_mismatch');
    const command = parsePdfCommand(body.command);
    if (!command || command.expectedHeadVersion !== input.anchor.tripVersion) return denied('binding_mismatch');
    const raw = await read(() => reads.readPdfOperation(input.anchor.tripId, command.operationId, structuredClone(identity), signal));
    const operation = parsePdfOperation(raw, input.anchor.tripId, command.operationId, identity.mobileEpoch);
    if (!operation || operation.state !== 'confirmed') return denied('not_confirmed');
    if (operation.requestDigest !== pdfRequestDigest(original.originalProposalBytes) || operation.commandDigest !== pdfDigest(command)
      || operation.previewDigest !== body.reviewedPreviewDigest || operation.baseTripVersion !== input.anchor.tripVersion
      || operation.expiresAt !== command.expiresAt) return denied('binding_mismatch');
    if (expired(command.expiresAt)) return denied('source_expired');
    const current = await read(() => reads.readTrip(input.anchor.tripId, signal));
    if (!trip(current) || current.tripId !== input.anchor.tripId || current.confirmationState !== 'confirmed'
      || !object(current.snapshot) || current.snapshot.version !== operation.resultingVersion
      || current.versions.filter(e => e.id === operation.confirmationEventId && e.proposalId === operation.proposalId
        && e.resultingVersion === operation.resultingVersion && e.eventType === 'proposal_applied').length !== 1) return denied('readback_mismatch');
    // Recheck the original immutable receipt, source/withdrawal, exact snapshot and actor.
    const again = await read(() => reads.readPdfOperation(input.anchor.tripId, command.operationId, structuredClone(identity), signal));
    const finalTrip = await read(() => reads.readTrip(input.anchor.tripId, signal));
    const finalSource = await read(() => reads.readSelection(input.logicalId, signal));
    const finalActor = await read(() => reads.readActor(signal));
    if (!actor(finalActor) || pdfDigest(finalActor) !== pdfDigest(identity)) return denied('actor_changed');
    if (!selection(finalSource) || pdfDigest(finalSource) !== pdfDigest(original)) return denied('source_changed');
    if (expired(original.expiresAt) || expired(command.expiresAt)) return denied('source_expired');
    if (pdfDigest(again) !== pdfDigest(raw)) return denied('source_changed');
    if (!trip(finalTrip) || pdfDigest(finalTrip) !== pdfDigest(current)) return denied('readback_mismatch');
    return { kind: 'qualified', source: input, actor: identity,
      original: { operationId: operation.operationId, proposalId: operation.proposalId!, proposalRevision: operation.proposalRevision!,
        confirmationEventId: operation.confirmationEventId!, baseTripVersion: operation.baseTripVersion!, resultingVersion: operation.resultingVersion! },
      presented: original.presentation === 'rendered_confirmed_readback' ? 'observed' : 'unknown', adopted: true, saved: true };
  } catch { return denied('source_unavailable'); }
  finally { clearTimeout(timer); options.signal.removeEventListener('abort', abort); controller.abort(); }
}
