import { nativeRequestScope } from '../identity/native-request.ts';
import type { ReminderTransport, DeliveryOutcome } from './delivery-contract.ts';
import { object, exact, uuid, integer, timestamp } from './wire.ts';
import { deliveryOutcome } from './codec.ts';
import { randomUUID } from 'node:crypto';

export type NotificationRpc = (name: 'poll_travel_notifications_v2' | 'dispatch_travel_notification_v2', parameters: Readonly<Record<string, unknown>>, signal: AbortSignal) => Promise<unknown>;
type Attempt = Readonly<{ kind: 'attempt'; notificationId: string; attemptId: string; deviceRevision: number; token: string; environment: 'sandbox' | 'production'; topic: string; expiresAt: string; authorizedAt: string; leaseExpiresAt: string }>;
function decodeAttempt(v: unknown, notificationId: string, attemptId: string, now: number): Attempt | null {
  if (!object(v) || !exact(v, ['kind', 'notificationId', 'attemptId', 'deviceRevision', 'token', 'environment', 'topic', 'expiresAt', 'authorizedAt', 'leaseExpiresAt']) || v.kind !== 'attempt' || v.notificationId !== notificationId || v.attemptId !== attemptId || !integer(v.deviceRevision, 1) || typeof v.token !== 'string' || !/^[a-f0-9]{2,512}$/.test(v.token) || v.token.length % 2 !== 0 || !['sandbox', 'production'].includes(String(v.environment)) || typeof v.topic !== 'string' || !/^[A-Za-z0-9.-]{1,200}$/.test(v.topic) || !timestamp(v.expiresAt) || !timestamp(v.authorizedAt) || !timestamp(v.leaseExpiresAt)) return null;
  const at = Date.parse(v.authorizedAt), lease = Date.parse(v.leaseExpiresAt);
  if (at > now + 1000 || lease <= now || lease <= at || lease - at > 5000 || Date.parse(v.expiresAt) <= now) return null;
  return v as Attempt;
}
function receipt(v: unknown, attempt: Attempt): DeliveryOutcome | null {
  if (!object(v) || !exact(v, ['kind', 'notificationId', 'attemptId', 'state', 'outcome']) || v.kind !== 'receipt' || v.notificationId !== attempt.notificationId || v.attemptId !== attempt.attemptId || !deliveryOutcome(v.outcome) || v.state !== v.outcome.kind || v.outcome.kind === 'accepted' && v.outcome.apnsId !== attempt.attemptId) return null;
  return v.outcome;
}
/** One finite notification-only tick, no task execution or autonomous retry loop. */
export async function runNotificationScheduler(options: Readonly<{ enabled?: boolean; rpc: NotificationRpc; transport: ReminderTransport; now?: () => Date }>, signal: AbortSignal): Promise<'disabled' | 'idle' | 'blocked' | 'accepted' | 'unknown' | 'error'> {
  if (options.enabled !== true || options.transport.available !== true) return 'disabled';
  if (signal.aborted) return 'blocked';
  const clock = options.now ?? (() => new Date());
  const rpc: NotificationRpc = async (name, params, external) => {
    const scope = nativeRequestScope(external, 5000);
    try { return await scope.run(() => options.rpc(name, params, scope.signal)); } finally { scope.dispose(); }
  };
  let candidate: unknown;
  try { candidate = await rpc('poll_travel_notifications_v2', { p_limit: 1 }, signal); } catch { return 'unknown'; }
  if (object(candidate) && exact(candidate, ['kind']) && candidate.kind === 'idle') return 'idle';
  if (!object(candidate) || !exact(candidate, ['kind', 'notificationId']) || candidate.kind !== 'candidate' || !uuid(candidate.notificationId)) return 'blocked';
  const notificationId = candidate.notificationId, attemptId = randomUUID();
  let grant: unknown;
  try { grant = await rpc('dispatch_travel_notification_v2', { p_notification: notificationId, p_action: 'begin', p_input: { attemptId } }, signal); } catch { return 'unknown'; }
  const attempt = decodeAttempt(grant, notificationId, attemptId, clock().getTime());
  if (!attempt) return 'blocked';
  // No send follows a stale/aborted grant. The durable attempt remains unknown,
  // never put back into a retryable queue even when no network call happened.
  let outcome: DeliveryOutcome = { kind: 'unknown', code: 'ACK_UNKNOWN' };
  const binding = options.transport.binding;
  if (!binding || binding.environment !== attempt.environment || binding.topic !== attempt.topic) outcome = { kind: 'error', code: 'TRANSPORT_UNAVAILABLE' };
  else if (!signal.aborted && clock().getTime() < Date.parse(attempt.leaseExpiresAt) && clock().getTime() < Date.parse(attempt.expiresAt)) {
    const sending = nativeRequestScope(signal, 3000);
    try { const result = await sending.run(() => options.transport.send({ token: attempt.token, apnsId: attemptId, notificationId, environment: attempt.environment, topic: attempt.topic, expiresAt: attempt.expiresAt })); if (deliveryOutcome(result) && (result.kind !== 'accepted' || result.apnsId === attemptId)) outcome = result; } catch { /* uncertain transport, no automatic retry */ }
    finally { sending.dispose(); }
  }
  const cleanup = new AbortController();
  try {
    const saved = receipt(await rpc('dispatch_travel_notification_v2', { p_notification: notificationId, p_action: 'finish', p_input: { attemptId, deviceRevision: attempt.deviceRevision, outcome } }, cleanup.signal), attempt);
    if (saved) return saved.kind;
  } catch { /* a lost database ACK is read back using the exact attempt */ }
  try {
    const saved = receipt(await rpc('dispatch_travel_notification_v2', { p_notification: notificationId, p_action: 'read', p_input: { attemptId } }, cleanup.signal), attempt);
    return saved?.kind ?? 'unknown';
  } catch { return 'unknown'; }
}
