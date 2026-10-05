import { supabaseWorkerHeaders } from '../jobs/supabase-worker-headers.ts';
import type { NotificationRpc } from './scheduler.ts';

/** Dedicated notification port. Supplied credentials/role need separate activation;
 * this factory neither obtains credentials nor grants any database authority. */
export function notificationRpc(options: Readonly<{ enabled?: boolean; url: string; serviceKey: string }>, fetcher: typeof fetch = fetch): NotificationRpc {
  const target = new URL(options.url);
  if (target.username || target.password || target.search || target.hash || target.pathname !== '/' || !(target.protocol === 'https:' && /^[a-z0-9]{20}\.supabase\.co$/.test(target.hostname) || target.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(target.hostname))) throw Error('Notification transport unavailable');
  const headers = supabaseWorkerHeaders(options.serviceKey);
  return async (name, parameters, signal) => {
    if (options.enabled !== true || signal.aborted || !['poll_travel_notifications_v2', 'dispatch_travel_notification_v2'].includes(name)) throw Error('Notification transport unavailable');
    const response = await fetcher(`${target.origin}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(parameters), signal, redirect: 'error', credentials: 'omit', cache: 'no-store' });
    if (response.status !== 200 || response.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') { try { void response.body?.cancel().catch(() => {}); } catch { /* no response body escapes */ } throw Error('Notification transport unavailable'); }
    const reader = response.body?.getReader();
    if (!reader) throw Error('Notification transport unavailable');
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        bytes += result.value.byteLength;
        if (bytes > 8192 || signal.aborted) throw Error('Notification transport unavailable');
        chunks.push(result.value);
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { throw Error('Notification transport unavailable'); }
    finally { try { void reader.cancel().catch(() => {}); } catch { /* bounded caller owns lifetime */ } reader.releaseLock(); }
  };
}
