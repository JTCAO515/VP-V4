import { SCHEMA, PURPOSE, record, exact, uuid, positive, natural, hash } from '../../journey-entry/experience-measurement/contract.ts';
export type MaintenanceRPC = (action: 'purge' | 'restore_check', input: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>;
export type PurgePolicy = Readonly<{ enabled: true; schemaVersion: typeof SCHEMA; maxBatches: number; batchSize: number; maxRunMs: number }>;
function untilAbort<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(Error('MEASUREMENT_UNAVAILABLE'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { signal.removeEventListener('abort', abort); abort(); return; }
    Promise.resolve().then(work).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
export function parsePurgePolicy(v: unknown): PurgePolicy | null {
  return record(v) && exact(v, ['enabled', 'schemaVersion', 'maxBatches', 'batchSize', 'maxRunMs']) && v.enabled === true && v.schemaVersion === SCHEMA
    && positive(v.maxBatches) && v.maxBatches <= 100 && positive(v.batchSize) && v.batchSize <= 1000 && positive(v.maxRunMs) && v.maxRunMs <= 30000 ? v as PurgePolicy : null;
}
/** One controlled maintenance tick. SQL physically deletes expired/retired
 * data in bounded transactions and only reports caught-up when none remain.
 * Existing maintenance registration is required; this code creates no job. */
export async function purgeMeasurement(policy: PurgePolicy | null, rpc: MaintenanceRPC, signal: AbortSignal): Promise<Readonly<{
  state: 'disabled' | 'caught_up' | 'bounded' | 'unknown'; batches: number; erasedRows: number;
}>> {
  if (!policy || !parsePurgePolicy(policy) || signal.aborted) return { state: 'disabled', batches: 0, erasedRows: 0 };
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(policy.maxRunMs)]);
  let batches = 0, erasedRows = 0;
  try {
    while (batches < policy.maxBatches && !bounded.aborted) {
      const result = await untilAbort(() => rpc('purge', { schemaVersion: SCHEMA, purpose: PURPOSE, limit: policy.batchSize }, bounded), bounded);
      if (!record(result) || !exact(result, ['schemaVersion', 'purpose', 'kind', 'erasedRows', 'hasMore']) || result.schemaVersion !== SCHEMA
        || result.purpose !== PURPOSE || result.kind !== 'purged' || !natural(result.erasedRows) || result.erasedRows > policy.batchSize
        || typeof result.hasMore !== 'boolean' || bounded.aborted) return { state: 'unknown', batches, erasedRows };
      batches++; erasedRows += result.erasedRows;
      if (!result.hasMore) return { state: 'caught_up', batches, erasedRows };
      if (result.erasedRows === 0) return { state: 'unknown', batches, erasedRows };
    }
    return { state: bounded.aborted ? 'unknown' : 'bounded', batches, erasedRows };
  } catch { return { state: 'unknown', batches, erasedRows }; }
}
export type RestoreJournal = Readonly<{ ownerId: string; journalId: string; floor: number; sourceLayoutDigest: string; capturedAt: number; expiresAt: number }>;
/** Caller supplies a separately acquired LIVE journal; never take it from the
 * restored bundle. SQL independently checks latest journal/floor/source layout.
 * No restore writer exists in this consumer; default deny is explicit. */
export async function measurementRestoreAllowed(journal: RestoreJournal | null, rpc: MaintenanceRPC, signal: AbortSignal, now = Date.now()): Promise<boolean> {
  if (!journal || !uuid(journal.ownerId) || !uuid(journal.journalId) || !natural(journal.floor) || !hash(journal.sourceLayoutDigest)
    || !positive(journal.capturedAt) || journal.capturedAt > now || journal.expiresAt <= now || journal.expiresAt > journal.capturedAt + 30000 || signal.aborted) return false;
  try {
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, Math.min(30000, journal.expiresAt - now)))]);
    const v = await untilAbort(() => rpc('restore_check', { schemaVersion: SCHEMA, purpose: PURPOSE, ...journal }, bounded), bounded);
    return !bounded.aborted && record(v) && exact(v, ['schemaVersion', 'purpose', 'kind', 'ownerId', 'journalId', 'floor', 'sourceLayoutDigest', 'allowed'])
      && v.schemaVersion === SCHEMA && v.purpose === PURPOSE && v.kind === 'restore_check' && v.ownerId === journal.ownerId
      && v.journalId === journal.journalId && v.floor === journal.floor && v.sourceLayoutDigest === journal.sourceLayoutDigest && v.allowed === true;
  } catch { return false; }
}
