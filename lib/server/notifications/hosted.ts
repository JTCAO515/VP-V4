import { generateKeyPairSync } from 'node:crypto';
import { apnsExchange, type ApnsConfiguration } from './apns.ts';
import { createNotificationRuntime } from './runtime.ts';
import { notificationRpc } from './rpc.ts';
import { integer } from './wire.ts';

export type NotificationHostProfile = 'disabled' | 'local' | 'staging' | 'production';
export type NotificationHostOptions = Readonly<{ profile?: NotificationHostProfile; ticks?: number; maxMs?: number; intervalMs?: number }>;
export type NotificationHostResult = Readonly<{ schemaVersion: 'notification-host/1'; profile: NotificationHostProfile; reason: 'disabled' | 'completed' | 'stopped' | 'unavailable'; ticks: number; accepted: number; unknown: number; error: number; blocked: number }>;
const loopback = (raw: string) => { try { const u = new URL(raw); return u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname) && !u.username && !u.password && !u.search && !u.hash && u.pathname === '/'; } catch { return false; } };
/** Dedicated finite caller; the original Task worker, queue and secrets remain untouched. */
export async function runHostedNotifications(options: NotificationHostOptions, external: AbortSignal, environment: Readonly<Record<string, string | undefined>> = process.env, fetcher: typeof fetch = fetch): Promise<NotificationHostResult> {
  const profile = options.profile ?? 'disabled', ticks = options.ticks ?? 1, maxMs = options.maxMs ?? 25000, intervalMs = options.intervalMs ?? 0;
  const result = { schemaVersion: 'notification-host/1' as const, profile, reason: 'disabled' as NotificationHostResult['reason'], ticks: 0, accepted: 0, unknown: 0, error: 0, blocked: 0 };
  if (!['disabled', 'local', 'staging', 'production'].includes(profile) || !integer(ticks, 1, 8) || !integer(maxMs, 1000, 60000) || !integer(intervalMs, 0, 5000)) return { ...result, reason: 'unavailable' };
  // Stop before reading any endpoint, key, token or credential factory.
  if (profile === 'disabled' || environment.VISEPANDA_REMINDER_DELIVERY_ENABLED !== 'true') return result;
  if (external.aborted) return { ...result, reason: 'stopped' };
  if (environment.VERCEL_ENV || environment.VISEPANDA_REMINDER_HOST_PROFILE !== profile) return { ...result, reason: 'unavailable' };
  const url = environment.VISEPANDA_REMINDER_DATABASE_URL, serviceKey = environment.VISEPANDA_REMINDER_WORKER_KEY;
  const topic = environment.VISEPANDA_REMINDER_APNS_TOPIC, target = environment.VISEPANDA_REMINDER_APNS_ENVIRONMENT;
  if (!url || !serviceKey || !topic || (target !== 'sandbox' && target !== 'production') || profile === 'staging' && target !== 'sandbox' || profile === 'production' && target !== 'production') return { ...result, reason: 'unavailable' };
  if (profile === 'local' ? !loopback(url) : !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url) || environment.VISEPANDA_REMINDER_APPROVED_DATABASE_URL !== url) return { ...result, reason: 'unavailable' };
  const controller = new AbortController(), stop = () => controller.abort();
  external.addEventListener('abort', stop, { once: true });
  if (external.aborted) stop();
  const deadline = setTimeout(stop, maxMs);
  try {
    let configuration: ApnsConfiguration, exchange: typeof apnsExchange | undefined;
    if (profile === 'local') {
      const mock = environment.VISEPANDA_REMINDER_LOCAL_APNS_URL;
      if (environment.VISEPANDA_REMINDER_LOCAL_SYNTHETIC !== 'true' || target !== 'sandbox' || !mock || !loopback(mock)) return { ...result, reason: 'unavailable' };
      // Local profile never reads a real APNs key or contacts Apple. The mock sees
      // no bearer JWT; acceptance here is explicitly synthetic by profile.
      const key = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey;
      configuration = { teamId: 'SYNTHETIC1', keyId: 'SYNTHETIC2', topic, environment: 'sandbox', privateKey: key.export({ type: 'pkcs8', format: 'pem' }).toString() };
      exchange = request => { const { authorization: _secret, ...headers } = request.headers; return apnsExchange({ ...request, origin: mock, headers }); };
    } else {
      const teamId = environment.VISEPANDA_REMINDER_APNS_TEAM_ID, keyId = environment.VISEPANDA_REMINDER_APNS_KEY_ID, privateKey = environment.VISEPANDA_REMINDER_APNS_PRIVATE_KEY;
      if (!teamId || !keyId || !privateKey) return { ...result, reason: 'unavailable' };
      configuration = { teamId, keyId, topic, environment: target, privateKey };
    }
    const runtime = createNotificationRuntime({ enabled: true, configuration, exchange, rpc: notificationRpc({ enabled: true, url, serviceKey }, fetcher) });
    if (!runtime.available) return { ...result, reason: 'unavailable' };
    result.reason = 'completed';
    for (let i = 0; i < ticks; i++) {
      if (controller.signal.aborted) { result.reason = 'stopped'; break; }
      const outcome = await runtime.tick(controller.signal); result.ticks++;
      if (outcome === 'accepted' || outcome === 'unknown' || outcome === 'error' || outcome === 'blocked') result[outcome]++;
      if (outcome === 'unknown' || outcome === 'error' || outcome === 'blocked') { result.reason = 'unavailable'; break; }
      if (i + 1 < ticks && intervalMs > 0) await new Promise<void>(resolve => { const finish = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', finish); resolve(); }; const timer = setTimeout(finish, intervalMs); controller.signal.addEventListener('abort', finish, { once: true }); if (controller.signal.aborted) finish(); });
    }
    if (controller.signal.aborted) result.reason = 'stopped';
    return result;
  } catch { return { ...result, reason: controller.signal.aborted ? 'stopped' : 'unavailable' }; }
  finally { clearTimeout(deadline); external.removeEventListener('abort', stop); }
}
