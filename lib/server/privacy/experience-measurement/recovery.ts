import { createHash, randomUUID } from 'node:crypto';
import { SCHEMA, PURPOSE, TTL, record, exact, uuid, hash, natural, positive } from '../../journey-entry/experience-measurement/contract.ts';
import { exportCanonical } from '../export-dispatcher.ts';

export type RecoverySource = Readonly<{ kind: 'protected_live' | 'synthetic_fixture'; sourceId: string; instanceId: string }>;
export type RecoveryContext = Readonly<{
  schemaVersion: typeof SCHEMA; purpose: typeof PURPOSE; kind: 'measurement_recovery_context';
  requestId: string; leaseId: string; generation: number; ownerId: string; scope: typeof SCHEMA;
  mode: 'scoped_restore' | 'whole_database'; source: RecoverySource; targetInstanceId: string;
  layoutDigest: string; pinsDigest: string; backupCutoffAt: number; capturedAt: number; expiresAt: number;
  barrier: Readonly<{ kind: 'writers_quiesced'; barrierId: string; generation: number; closedAt: number; expiresAt: number }>;
}>;
export type CopyObligation = Readonly<{ copyId: string; executorId: string | null; ackId: string | null;
  state: 'acknowledged' | 'outstanding' | 'unknown'; authorityReceivedAt: number; expiresAt: number }>;
export const CONTROL_ROWS = ['consents', 'admissions', 'reports', 'erasureReceipts', 'recoveryControls', 'journals', 'copyObligations'] as const;
export type ControlRows = Readonly<Record<typeof CONTROL_ROWS[number], number>>;
export type RecoveryFrame = Readonly<{
  schemaVersion: typeof SCHEMA; purpose: typeof PURPOSE; kind: 'measurement_recovery_journal';
  requestId: string; leaseId: string; generation: number; acquisitionId: string; challenge: string;
  ownerId: string; scope: typeof SCHEMA; source: RecoverySource; targetInstanceId: string;
  layoutDigest: string; pinsDigest: string; reconciliationGeneration: number; journalId: string; floor: number;
  cutoffAt: number; coveredFromAt: number; coveredThroughAt: number; barrierId: string;
  capturedAt: number; expiresAt: number; authorityReceivedAt: number; retainedUntil: number;
  coverage: Readonly<Record<'withdrawals' | 'erasures' | 'sourceExpiry' | 'copies', 'complete' | 'partial' | 'unknown'>>;
  inventory: ControlRows; copies: readonly CopyObligation[]; authorityInventoryDigest: string;
  sourceSeal: Readonly<{ kind: 'source_obtained'; sealId: string; digest: string }>; integrityDigest: string;
}>;
export type IssueRequest = Readonly<{ requestId: string; leaseId: string; generation: number; acquisitionId: string; challenge: string }>;
/** Only an original protected operator/Core recovery adapter may implement
 * this port. It must authenticate the STILL-LIVE source outside the payload
 * and target instance. No URL, owner, floor, journal or service key comes from
 * Native/User HTTP. No installed adapter exists in the current repository. */
export type CoreRecoveryAdapter = Readonly<{
  open(requestId: string, signal: AbortSignal): Promise<unknown>;
  issue(request: IssueRequest, signal: AbortSignal): Promise<unknown>;
  authenticate(context: RecoveryContext, frame: RecoveryFrame, signal: AbortSignal): Promise<boolean>;
  current(context: RecoveryContext, signal: AbortSignal): Promise<unknown>;
  reconcile(context: RecoveryContext, frame: RecoveryFrame, signal: AbortSignal): Promise<unknown>;
}>;
export type AcquiredRecovery = Readonly<{ kind: 'measurement_acquired_recovery'; acquisitionId: string }>;
type Stored = Readonly<{ context: RecoveryContext; frame: RecoveryFrame; adapter: CoreRecoveryAdapter; expiryTimer: ReturnType<typeof setTimeout> }>;
const acquisitions = new WeakMap<object, Stored>();
const contextKeys = ['schemaVersion', 'purpose', 'kind', 'requestId', 'leaseId', 'generation', 'ownerId', 'scope', 'mode', 'source',
  'targetInstanceId', 'layoutDigest', 'pinsDigest', 'backupCutoffAt', 'capturedAt', 'expiresAt', 'barrier'] as const;
export const RECOVERY_FRAME_KEYS = ['schemaVersion', 'purpose', 'kind', 'requestId', 'leaseId', 'generation', 'acquisitionId', 'challenge',
  'ownerId', 'scope', 'source', 'targetInstanceId', 'layoutDigest', 'pinsDigest', 'reconciliationGeneration', 'journalId', 'floor',
  'cutoffAt', 'coveredFromAt', 'coveredThroughAt', 'barrierId', 'capturedAt', 'expiresAt', 'authorityReceivedAt', 'retainedUntil',
  'coverage', 'inventory', 'copies', 'authorityInventoryDigest', 'sourceSeal', 'integrityDigest'] as const;
const base = (v: Record<string, unknown>) => v.schemaVersion === SCHEMA && v.purpose === PURPOSE && v.scope === SCHEMA;
const fresh = (capturedAt: unknown, expiresAt: unknown, now: number) => positive(capturedAt) && positive(expiresAt)
  && capturedAt <= now && expiresAt > now && expiresAt <= capturedAt + 30000;
const source = (v: unknown): v is RecoverySource => record(v) && exact(v, ['kind', 'sourceId', 'instanceId'])
  && ['protected_live', 'synthetic_fixture'].includes(String(v.kind)) && uuid(v.sourceId) && uuid(v.instanceId);
const sameSource = (a: RecoverySource, b: RecoverySource) => a.kind === b.kind && a.sourceId === b.sourceId && a.instanceId === b.instanceId;
export function validControlRows(v: unknown): v is ControlRows {
  return record(v) && exact(v, CONTROL_ROWS) && CONTROL_ROWS.every(k => natural(v[k]) && Number(v[k]) <= 10000)
    && CONTROL_ROWS.reduce((n, k) => n + Number(v[k]), 0) <= 10000;
}
export function validCopies(v: unknown, now: number): v is readonly CopyObligation[] {
  if (!Array.isArray(v) || v.length > 10000) return false;
  let previous = '';
  for (const c of v) {
    if (!record(c) || !exact(c, ['copyId', 'executorId', 'ackId', 'state', 'authorityReceivedAt', 'expiresAt']) || !uuid(c.copyId) || c.copyId <= previous
      || !(c.executorId === null || uuid(c.executorId)) || !(c.ackId === null || uuid(c.ackId))
      || !['acknowledged', 'outstanding', 'unknown'].includes(String(c.state)) || !positive(c.authorityReceivedAt) || c.authorityReceivedAt > now
      || !positive(c.expiresAt) || c.expiresAt <= now || c.expiresAt > c.authorityReceivedAt + TTL
      || (c.state === 'acknowledged' ? !uuid(c.executorId) || !uuid(c.ackId) : c.ackId !== null)) return false;
    previous = c.copyId;
  }
  return true;
}
export function decodeRecoveryContext(v: unknown, requestId: string, now: number): RecoveryContext | null {
  if (!record(v) || !exact(v, contextKeys) || !base(v) || v.kind !== 'measurement_recovery_context' || v.requestId !== requestId
    || ![v.requestId, v.leaseId, v.ownerId, v.targetInstanceId].every(uuid) || !positive(v.generation) || !source(v.source)
    || v.mode !== 'scoped_restore' || v.source.instanceId === v.targetInstanceId || !hash(v.layoutDigest) || !hash(v.pinsDigest)
    || !positive(v.backupCutoffAt) || v.backupCutoffAt > now || !fresh(v.capturedAt, v.expiresAt, now) || !record(v.barrier)) return null;
  const b = v.barrier;
  if (!exact(b, ['kind', 'barrierId', 'generation', 'closedAt', 'expiresAt']) || b.kind !== 'writers_quiesced' || !uuid(b.barrierId)
    || b.generation !== v.generation || !positive(b.closedAt) || b.closedAt < v.backupCutoffAt || b.closedAt > Number(v.capturedAt)
    || !positive(b.expiresAt) || b.expiresAt < Number(v.expiresAt)) return null;
  return v as unknown as RecoveryContext;
}
/** Integrity hash is metadata-only. It is deliberately NOT source authentication. */
export function recoveryIntegrity(frame: Omit<RecoveryFrame, 'integrityDigest'>): string {
  return createHash('sha256').update(exportCanonical(frame)).digest('hex');
}
export function decodeRecoveryFrame(v: unknown, c: RecoveryContext, request: IssueRequest, now: number): RecoveryFrame | null {
  if (!record(v) || !exact(v, RECOVERY_FRAME_KEYS) || !base(v) || v.kind !== 'measurement_recovery_journal'
    || Buffer.byteLength(exportCanonical(v)) > 1_000_000 || ![v.journalId, v.acquisitionId, v.challenge].every(uuid)
    || v.requestId !== c.requestId || v.leaseId !== c.leaseId || v.generation !== c.generation || v.acquisitionId !== request.acquisitionId || v.challenge !== request.challenge
    || v.ownerId !== c.ownerId || v.targetInstanceId !== c.targetInstanceId || !source(v.source) || !sameSource(v.source, c.source)
    || v.layoutDigest !== c.layoutDigest || v.pinsDigest !== c.pinsDigest || v.reconciliationGeneration !== c.generation
    || !natural(v.floor) || v.cutoffAt !== c.backupCutoffAt || !positive(v.coveredFromAt) || v.coveredFromAt > v.cutoffAt
    || v.coveredFromAt < now - TTL || !positive(v.coveredThroughAt) || v.coveredThroughAt < c.barrier.closedAt || v.coveredThroughAt > Number(v.capturedAt)
    || v.barrierId !== c.barrier.barrierId || !fresh(v.capturedAt, v.expiresAt, now) || Number(v.expiresAt) > c.expiresAt
    || !positive(v.authorityReceivedAt) || v.authorityReceivedAt > Number(v.capturedAt) || !positive(v.retainedUntil) || v.retainedUntil <= now
    || v.retainedUntil > v.authorityReceivedAt + TTL || Number(v.expiresAt) > v.retainedUntil || !hash(v.authorityInventoryDigest)
    || !validControlRows(v.inventory) || !validCopies(v.copies, now) || v.inventory.copyObligations !== v.copies.length
    || !record(v.coverage) || !exact(v.coverage, ['withdrawals', 'erasures', 'sourceExpiry', 'copies'])
    || !Object.values(v.coverage).every(x => ['complete', 'partial', 'unknown'].includes(String(x)))
    || !record(v.sourceSeal) || !exact(v.sourceSeal, ['kind', 'sealId', 'digest']) || v.sourceSeal.kind !== 'source_obtained'
    || !uuid(v.sourceSeal.sealId) || !hash(v.sourceSeal.digest) || !hash(v.integrityDigest)) return null;
  const { integrityDigest, ...unsigned } = v;
  if (recoveryIntegrity(unsigned as unknown as Omit<RecoveryFrame, 'integrityDigest'>) !== integrityDigest) return null;
  return v as unknown as RecoveryFrame;
}
async function bounded<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(Error('MEASUREMENT_UNAVAILABLE'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { signal.removeEventListener('abort', abort); abort(); return; }
    Promise.resolve().then(work).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
function current(v: unknown, c: RecoveryContext, now: number): boolean {
  return record(v) && exact(v, ['schemaVersion', 'purpose', 'kind', 'requestId', 'leaseId', 'generation', 'ownerId', 'scope', 'source', 'targetInstanceId',
    'layoutDigest', 'pinsDigest', 'barrierId', 'coveredThroughAt', 'expiresAt', 'state']) && base(v) && v.kind === 'measurement_recovery_current'
    && v.requestId === c.requestId && v.leaseId === c.leaseId && v.generation === c.generation && v.ownerId === c.ownerId
    && source(v.source) && sameSource(v.source, c.source) && v.targetInstanceId === c.targetInstanceId && v.layoutDigest === c.layoutDigest
    && v.pinsDigest === c.pinsDigest && v.barrierId === c.barrier.barrierId && v.coveredThroughAt === c.barrier.closedAt
    && v.expiresAt === c.expiresAt && Number(v.expiresAt) > now && v.state === 'current';
}
/** The sole acquisition path: original Core lease -> still-live issuer ->
 * authenticated frame -> current barrier. An arbitrary deserialized journal
 * cannot become an acquired handle. No installed/live adapter is asserted. */
export async function acquireMeasurementRecovery(requestId: string, adapter: CoreRecoveryAdapter | null, signal: AbortSignal,
  now: () => number = Date.now): Promise<AcquiredRecovery | null> {
  if (!uuid(requestId) || !adapter || signal.aborted) return null;
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
  try {
    const decodedContext = decodeRecoveryContext(await bounded(() => adapter.open(requestId, deadline), deadline), requestId, now()); if (!decodedContext) return null;
    const c = structuredClone(decodedContext);
    const lifetime = AbortSignal.any([deadline, AbortSignal.timeout(Math.max(1, c.expiresAt - now()))]);
    const request = { requestId: c.requestId, leaseId: c.leaseId, generation: c.generation, acquisitionId: randomUUID(), challenge: randomUUID() };
    const decodedFrame = decodeRecoveryFrame(await bounded(() => adapter.issue({ ...request }, lifetime), lifetime), c, request, now());
    if (!decodedFrame) return null;
    const frame = structuredClone(decodedFrame);
    if (Object.values(frame.coverage).some(x => x !== 'complete') || frame.copies.some(copy => copy.state !== 'acknowledged')) return null;
    // A valid digest, signature-looking string or layout flag is insufficient.
    if (!await bounded(() => adapter.authenticate(structuredClone(c), structuredClone(frame), lifetime), lifetime)
      || !current(await bounded(() => adapter.current(structuredClone(c), lifetime), lifetime), c, now()) || lifetime.aborted || now() >= frame.expiresAt) return null;
    const handle: AcquiredRecovery = Object.freeze({ kind: 'measurement_acquired_recovery', acquisitionId: frame.acquisitionId });
    const expiryTimer = setTimeout(() => acquisitions.delete(handle), Math.max(1, Math.min(c.expiresAt, frame.expiresAt) - now()));
    expiryTimer.unref();
    acquisitions.set(handle, { context: structuredClone(c), frame: structuredClone(frame), adapter, expiryTimer }); return handle;
  } catch { return null; }
}
export type RecoveryAssessment = Readonly<{ state: 'denied' | 'synthetic_qualified' | 'live_qualified';
  measurementSourceQualified: boolean; collectionEligible: false; wholeLifecycleComplete: false }>;
const denied = (): RecoveryAssessment => ({ state: 'denied', measurementSourceQualified: false, collectionEligible: false, wholeLifecycleComplete: false });
export async function reconcileMeasurementRecovery(handle: AcquiredRecovery | null, signal: AbortSignal,
  now: () => number = Date.now): Promise<RecoveryAssessment> {
  const stored = handle && acquisitions.get(handle); if (!stored || signal.aborted) return denied();
  // One acquired frame is used at most once. Unknown ACK needs fresh protected
  // acquisition/recovery; it cannot repeat a user/business/whole-DB restore.
  acquisitions.delete(handle!);
  clearTimeout(stored.expiryTimer);
  const { context: c, frame: f, adapter } = stored;
  if (now() >= f.expiresAt || now() >= c.expiresAt || f.source.instanceId === c.targetInstanceId) return denied();
  const lifetime = AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, Math.min(f.expiresAt, c.expiresAt) - now()))]);
  try {
    if (!current(await bounded(() => adapter.current(structuredClone(c), lifetime), lifetime), c, now())
      || !await bounded(() => adapter.authenticate(structuredClone(c), structuredClone(f), lifetime), lifetime)) return denied();
    const v = await bounded(() => adapter.reconcile(structuredClone(c), structuredClone(f), lifetime), lifetime);
    if (!record(v) || !exact(v, ['schemaVersion', 'purpose', 'kind', 'requestId', 'leaseId', 'generation', 'ownerId', 'scope', 'sourceId', 'targetInstanceId',
      'journalId', 'acquisitionId', 'reconciliationGeneration', 'layoutDigest', 'pinsDigest', 'barrierId', 'floor', 'authorityInventoryDigest',
      'integrityDigest', 'expiresAt', 'state', 'copies']) || !base(v) || v.kind !== 'measurement_recovery_reconciliation'
      || v.requestId !== c.requestId || v.leaseId !== c.leaseId || v.generation !== c.generation || v.ownerId !== c.ownerId
      || v.sourceId !== f.source.sourceId || v.targetInstanceId !== c.targetInstanceId || v.journalId !== f.journalId || v.acquisitionId !== f.acquisitionId
      || v.reconciliationGeneration !== f.reconciliationGeneration || v.layoutDigest !== c.layoutDigest || v.pinsDigest !== c.pinsDigest
      || v.barrierId !== f.barrierId || v.floor !== f.floor || v.authorityInventoryDigest !== f.authorityInventoryDigest || v.integrityDigest !== f.integrityDigest
      || v.expiresAt !== f.expiresAt || Number(v.expiresAt) <= now() || v.state !== 'reconciled' || !record(v.copies)
      || !exact(v.copies, ['state', 'obligations', 'acknowledged']) || v.copies.state !== 'acknowledged'
      || v.copies.obligations !== f.copies.length || v.copies.acknowledged !== f.copies.length
      || !current(await bounded(() => adapter.current(structuredClone(c), lifetime), lifetime), c, now()) || lifetime.aborted) return denied();
    return { state: f.source.kind === 'synthetic_fixture' ? 'synthetic_qualified' : 'live_qualified',
      measurementSourceQualified: true, collectionEligible: false, wholeLifecycleComplete: false };
  } catch { return denied(); }
}
