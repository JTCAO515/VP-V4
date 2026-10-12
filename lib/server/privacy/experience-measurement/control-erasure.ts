import { SCHEMA, PURPOSE, TTL, record, exact, uuid, hash, natural, positive } from '../../journey-entry/experience-measurement/contract.ts';
import { validControlRows, validCopies, CONTROL_ROWS, type ControlRows, type CopyObligation } from './recovery.ts';

export type ControlContext = Readonly<{ schemaVersion: typeof SCHEMA; purpose: typeof PURPOSE; kind: 'measurement_control_context';
  requestId: string; leaseId: string; generation: number; ownerId: string; scope: typeof SCHEMA;
  sourceId: string; layoutDigest: string; pinsDigest: string; capturedAt: number; expiresAt: number }>;
export type ControlInventory = Readonly<{ schemaVersion: typeof SCHEMA; purpose: typeof PURPOSE; kind: 'measurement_control_inventory';
  requestId: string; leaseId: string; generation: number; ownerId: string; scope: typeof SCHEMA; sourceId: string;
  layoutDigest: string; pinsDigest: string; sourceDigest: string; capturedAt: number; expiresAt: number;
  rows: ControlRows; copies: readonly CopyObligation[] }>;
/** Original explicitly selected Core/scoped deletion only. This port is not
 * installed, publicly routable or a second deletion/D2 engine. Executing any
 * real external copy action retains its existing operator authorization. */
export type CoreControlErasureAdapter = Readonly<{
  open(requestId: string, signal: AbortSignal): Promise<unknown>;
  current(context: ControlContext, signal: AbortSignal): Promise<unknown>;
  inventory(context: ControlContext, signal: AbortSignal): Promise<unknown>;
  eraseSource(context: ControlContext, inventory: ControlInventory, signal: AbortSignal): Promise<unknown>;
  eraseCopy(context: ControlContext, inventory: ControlInventory, copy: CopyObligation, signal: AbortSignal): Promise<unknown>;
}>;
const base = (v: Record<string, unknown>) => v.schemaVersion === SCHEMA && v.purpose === PURPOSE && v.scope === SCHEMA;
const bound = (v: Record<string, unknown>, c: ControlContext) => base(v) && v.requestId === c.requestId && v.leaseId === c.leaseId
  && v.generation === c.generation && v.ownerId === c.ownerId && v.sourceId === c.sourceId && v.layoutDigest === c.layoutDigest && v.pinsDigest === c.pinsDigest;
const fresh = (v: Record<string, unknown>, now: number) => positive(v.capturedAt) && positive(v.expiresAt)
  && v.capturedAt <= now && v.expiresAt > now && v.expiresAt <= v.capturedAt + 30000;
function context(v: unknown, requestId: string, now: number): ControlContext | null {
  return record(v) && exact(v, ['schemaVersion', 'purpose', 'kind', 'requestId', 'leaseId', 'generation', 'ownerId', 'scope', 'sourceId', 'layoutDigest', 'pinsDigest', 'capturedAt', 'expiresAt'])
    && base(v) && v.kind === 'measurement_control_context' && v.requestId === requestId && [v.requestId, v.leaseId, v.ownerId, v.sourceId].every(uuid)
    && positive(v.generation) && hash(v.layoutDigest) && hash(v.pinsDigest) && fresh(v, now) ? v as unknown as ControlContext : null;
}
function current(v: unknown, c: ControlContext, now: number): boolean {
  return record(v) && exact(v, ['schemaVersion', 'purpose', 'kind', 'requestId', 'leaseId', 'generation', 'ownerId', 'scope', 'sourceId', 'layoutDigest', 'pinsDigest', 'expiresAt', 'state'])
    && bound(v, c) && v.kind === 'measurement_control_current' && v.expiresAt === c.expiresAt && Number(v.expiresAt) > now && v.state === 'current';
}
export function decodeControlInventory(v: unknown, c: ControlContext, now: number): ControlInventory | null {
  return record(v) && exact(v, ['schemaVersion', 'purpose', 'kind', 'requestId', 'leaseId', 'generation', 'ownerId', 'scope', 'sourceId', 'layoutDigest', 'pinsDigest',
    'sourceDigest', 'capturedAt', 'expiresAt', 'rows', 'copies']) && bound(v, c) && v.kind === 'measurement_control_inventory' && hash(v.sourceDigest)
    && fresh(v, now) && Number(v.expiresAt) <= c.expiresAt && validControlRows(v.rows) && validCopies(v.copies, now)
    && v.rows.copyObligations === v.copies.length && Buffer.byteLength(JSON.stringify(v)) <= 1_000_000 ? v as unknown as ControlInventory : null;
}
async function bounded<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(Error('MEASUREMENT_UNAVAILABLE')); signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { signal.removeEventListener('abort', abort); abort(); return; }
    Promise.resolve().then(work).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
export type ControlErasureAssessment = Readonly<{ state: 'denied' | 'unknown' | 'source_erased' | 'scoped_source_and_copies_erased';
  sourceErased: boolean; copyState: 'unknown' | 'outstanding' | 'acknowledged'; copyObligations: number | null; copyAcks: number;
  wholeLifecycleComplete: false; collectionEligible: false }>;
const denied = (): ControlErasureAssessment => ({ state: 'denied', sourceErased: false, copyState: 'unknown', copyObligations: null,
  copyAcks: 0, wholeLifecycleComplete: false, collectionEligible: false });
const rows = (v: ControlRows) => CONTROL_ROWS.reduce((n, k) => n + v[k], 0);
/** Source erasure is recorded separately from external obligations. Unknown
 * executor/ACK remains incomplete, never zero. No retry of erasure effects. */
export async function eraseMeasurementControlScope(requestId: string, adapter: CoreControlErasureAdapter | null,
  signal: AbortSignal, now: () => number = Date.now): Promise<ControlErasureAssessment> {
  if (!uuid(requestId) || !adapter || signal.aborted) return denied();
  let sourceErased = false, obligations: number | null = null, acks = 0;
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
  try {
    const decodedContext = context(await bounded(() => adapter.open(requestId, deadline), deadline), requestId, now()); if (!decodedContext) return denied();
    const c = structuredClone(decodedContext);
    const lifetime = AbortSignal.any([deadline, AbortSignal.timeout(Math.max(1, c.expiresAt - now()))]);
    const decodedInventory = decodeControlInventory(await bounded(() => adapter.inventory(structuredClone(c), lifetime), lifetime), c, now());
    if (!decodedInventory || !current(await bounded(() => adapter.current(structuredClone(c), lifetime), lifetime), c, now())) return denied();
    const i = structuredClone(decodedInventory);
    obligations = i.copies.length;
    const v = await bounded(() => adapter.eraseSource(structuredClone(c), structuredClone(i), lifetime), lifetime);
    if (!record(v) || !exact(v, ['schemaVersion', 'purpose', 'kind', 'requestId', 'leaseId', 'generation', 'ownerId', 'scope', 'sourceId', 'layoutDigest', 'pinsDigest',
      'sourceDigest', 'state', 'consentRevoked', 'erasedRows', 'retainedControls', 'authorityReceivedAt', 'retainedUntil']) || !bound(v, c)
      || v.kind !== 'measurement_control_erasure' || v.sourceDigest !== i.sourceDigest || v.state !== 'source_erased' || v.consentRevoked !== true
      || !natural(v.erasedRows) || v.erasedRows > rows(i.rows) || !validControlRows(v.retainedControls)
      || !positive(v.authorityReceivedAt) || v.authorityReceivedAt > now() || !positive(v.retainedUntil) || v.retainedUntil <= now()
      || v.retainedUntil > v.authorityReceivedAt + TTL || ['consents', 'admissions', 'reports', 'journals'].some(k => Number((v.retainedControls as ControlRows)[k as keyof ControlRows]) !== 0)
      || v.erasedRows < i.rows.consents + i.rows.admissions + i.rows.reports + i.rows.journals) return { ...denied(), state: 'unknown', copyObligations: obligations };
    sourceErased = true;
    for (const copy of i.copies) {
      if (copy.state === 'acknowledged') { acks++; continue; }
      if (!copy.executorId || lifetime.aborted || now() >= i.expiresAt) continue;
      let ack: unknown;
      try { ack = await bounded(() => adapter.eraseCopy(structuredClone(c), structuredClone(i), structuredClone(copy), lifetime), lifetime); } catch { continue; }
      if (!record(ack) || !exact(ack, ['schemaVersion', 'purpose', 'kind', 'requestId', 'leaseId', 'generation', 'ownerId', 'scope', 'sourceId', 'layoutDigest', 'pinsDigest',
        'copyId', 'executorId', 'ackId', 'state']) || !bound(ack, c) || ack.kind !== 'measurement_copy_erasure' || ack.copyId !== copy.copyId
        || ack.executorId !== copy.executorId || !uuid(ack.ackId) || ack.state !== 'erased') continue;
      acks++;
    }
    if (!current(await bounded(() => adapter.current(structuredClone(c), lifetime), lifetime), c, now()) || lifetime.aborted)
      return { ...denied(), state: 'unknown', sourceErased, copyObligations: obligations, copyAcks: acks };
    return { state: acks === obligations ? 'scoped_source_and_copies_erased' : 'source_erased', sourceErased,
      copyState: acks === obligations ? 'acknowledged' : i.copies.some(x => !x.executorId || x.state === 'unknown') ? 'unknown' : 'outstanding',
      copyObligations: obligations, copyAcks: acks, wholeLifecycleComplete: false, collectionEligible: false };
  } catch { return { ...denied(), state: 'unknown', sourceErased, copyObligations: obligations, copyAcks: acks }; }
}
