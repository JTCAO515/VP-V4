/** Explicit one-shot local operator. Never runs from a deployed or default environment. */
import { createClient } from '@supabase/supabase-js';
const requestId = process.argv[2];
try {
  const target = new URL(process.env.VP_PRIVACY_LOCAL_URL ?? '');
  if (process.env.VP_PRIVACY_LOCAL_DISPOSABLE !== 'true' || process.env.VERCEL_ENV
    || process.argv.length !== 3 || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId ?? '')
    || target.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(target.hostname)
    || target.username || target.password || target.pathname !== '/' || target.search || target.hash
    || !process.env.VP_PRIVACY_LOCAL_SERVICE_KEY) throw Error('Unavailable');
  const signal = AbortSignal.timeout(30000);
  const client = createClient(target.origin, process.env.VP_PRIVACY_LOCAL_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (url, init) => fetch(url, { ...init, redirect: 'error', signal }) },
  });
  let data, error;
  for (let attempt = 0; attempt < 3; attempt++) {
    ({ data, error } = await client.rpc('execute_trip_deletion_v1', { p_request_id: requestId }).abortSignal(signal));
    if (!error || !['55P03', '40P01', '40001'].includes(error.code)) break;
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (error || data?.state !== 'completed' || data?.scope !== 'trip-core-v1' || data?.requestId !== requestId.toLowerCase()
    || data?.allUserDataCompleted !== false || !data?.completedAt) throw Error('Unavailable');
  console.log(JSON.stringify(data));
} catch {
  console.error('Trip deletion result unavailable. Read the same request receipt before retrying; no completion is inferred.');
  process.exitCode = 1;
}
