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
/** Legacy caller-journal entry is now negative-only per Main's lifecycle
 * decision. Matching hashes/freshness or a target RPC's allowed:true cannot
 * prove independent original source/latest coverage. Use recovery.ts's
 * protected Core acquisition and opaque one-use handle; never Native JSON. */
export async function measurementRestoreAllowed(_untrustedJournal: unknown, _rpc: MaintenanceRPC, _signal: AbortSignal, _now = Date.now()): Promise<boolean> {
  return false;
}
