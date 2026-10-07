import { nativeRequestScope } from '../../identity/native-request.ts';
import { record } from '../../guide/contract.ts';
import { RESULT_LIMITS, type ResultActor, type ResultCommand, type ResultScope } from './contract.ts';
import { decodeResultList } from './protocol.ts';

/** Read-only bounded inventory; one source snapshot, one absolute deadline. Never a mutation or retry. */
export async function collectResultInventory(scope: ResultScope, actor: ResultActor,
  read: (command: Extract<ResultCommand, { action: 'list' }>, signal: AbortSignal) => Promise<unknown>,
  current: (actor: ResultActor) => Promise<boolean>, signal: AbortSignal, now: () => number = Date.now): Promise<readonly Record<string, unknown>[]> {
  const lifetime = nativeRequestScope(signal, RESULT_LIMITS.lifetimeMs);
  try { return await lifetime.run(async () => {
  const started = now(); let deadline = started + RESULT_LIMITS.lifetimeMs;
  const items: Record<string, unknown>[] = []; let bytes = 2, sourceDigest: string | null = null;
  let cursor: Extract<ResultCommand, { action: 'list' }>['cursor'] = null;
  for (let page = 0; page <= RESULT_LIMITS.tableRows / RESULT_LIMITS.list; page++) {
    if (lifetime.signal.aborted || now() >= deadline || !await current(actor)) throw Error('RESULT_SOURCE_UNAVAILABLE');
    const command = { action: 'list', scope, rootKind: scope === 'result-sensitive-data/1' ? 'artifact' : null, cursor, limit: 20 } as const;
    const raw = await read(command, lifetime.signal), decoded = decodeResultList(raw, command, actor, now());
    if (lifetime.signal.aborted || now() >= deadline || !await current(actor) || !decoded) throw Error('RESULT_SOURCE_UNAVAILABLE');
    if (sourceDigest !== null && sourceDigest !== decoded.sourceDigest) throw Error('RESULT_SOURCE_CHANGED');
    sourceDigest = String(decoded.sourceDigest); deadline = Math.min(deadline, Number(decoded.expiresAt));
    for (const item of decoded.items as unknown[]) {
      if (!record(item)) throw Error('RESULT_SOURCE_UNAVAILABLE');
      bytes += Buffer.byteLength(JSON.stringify(item), 'utf8') + 1;
      if (items.length >= RESULT_LIMITS.tableRows || bytes > RESULT_LIMITS.maxBytes) throw Error('RESULT_CAPACITY');
      items.push(item);
    }
    if (decoded.hasMore === false) return items;
    cursor = decoded.nextCursor as typeof cursor;
  }
  throw Error('RESULT_CAPACITY');
  }); } finally { lifetime.dispose(); }
}
