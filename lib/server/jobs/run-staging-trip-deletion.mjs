/** Dedicated D1 queue consumer. Deployment is operator-owned and disabled by default. */
import { readFile, lstat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { supabaseWorkerHeaders } from './supabase-worker-headers.ts';

const database = 'https://dzqdzetcctkhbrhlxxgn.supabase.co';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function secret() {
  const file = process.env.VP_PRIVACY_STAGING_DB_KEY_FILE;
  if (!file || !isAbsolute(file)) throw Error('unavailable');
  const info = await lstat(file);
  if (!info.isFile() || (info.mode & 0o077) !== 0 || info.size > 4096) throw Error('unavailable');
  const value = (await readFile(file, 'utf8')).trim();
  if (!value || value.includes('\n')) throw Error('unavailable');
  return value;
}

export async function runTripDeletionPoll({ key, fetcher = fetch, cycles = 1, signal } = {}) {
  if (!key || !Number.isSafeInteger(cycles) || cycles < 1 || cycles > 100) throw Error('unavailable');
  const headers = supabaseWorkerHeaders(key);
  const rpc = async (name, body) => {
    const response = await fetcher(`${database}/rest/v1/rpc/${name}`, {
      method: 'POST', headers, body: JSON.stringify(body), cache: 'no-store', redirect: 'error',
      credentials: 'omit', signal: signal ?? AbortSignal.timeout(30000),
    });
    if (response.status !== 200 || response.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
      await response.body?.cancel();
      throw Error('unavailable');
    }
    const raw = await response.text();
    if (raw.length > 4096) throw Error('unavailable');
    return JSON.parse(raw);
  };
  let completed = 0;
  for (let cycle = 0; cycle < cycles; cycle++) {
    if (signal?.aborted) throw Error('unavailable');
    const requestID = await rpc('next_trip_deletion_v1', {});
    if (requestID === null) return { completed, empty: true };
    if (typeof requestID !== 'string' || !uuid.test(requestID)) throw Error('unavailable');
    let receipt;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { receipt = await rpc('execute_trip_deletion_v1', { p_request_id: requestID }); break; }
      catch (error) {
        if (attempt === 2 || signal?.aborted) throw error;
        await wait(200 * (attempt + 1));
      }
    }
    if (receipt?.version !== 1 || receipt.requestId?.toLowerCase() !== requestID.toLowerCase()
      || receipt.state !== 'completed' || !receipt.completedAt || receipt.scope !== 'trip-core-v1'
      || receipt.allUserDataCompleted !== false) throw Error('unavailable');
    completed++;
  }
  return { completed, empty: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.env.VP_PRIVACY_STAGING_WORKER !== 'true' || process.env.VERCEL_ENV
      || process.argv.length !== 2 || process.env.VP_PRIVACY_STAGING_CYCLES === undefined) throw Error('unavailable');
    const cycles = Number(process.env.VP_PRIVACY_STAGING_CYCLES);
    const result = await runTripDeletionPoll({ key: await secret(), cycles });
    console.log(JSON.stringify({ scope: 'trip-core-v1', ...result }));
  } catch {
    console.error('Trip deletion worker unavailable. Queued requests remain pending; inspect receipts before retrying.');
    process.exitCode = 1;
  }
}
