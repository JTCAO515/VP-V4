import { nativeRequestScope } from '../identity/native-request.ts';
import type { ReminderTransport, DeliveryOutcome } from './delivery-contract.ts';
import { object, exact, uuid } from './wire.ts';
import { deliveryOutcome } from './codec.ts';
import { randomUUID } from 'node:crypto';
import { beginNotificationSend, type NotificationSendGrant } from '../privacy/notification-data/sender.ts';

export type NotificationRpc = (name: 'poll_travel_notifications_v2' | 'dispatch_travel_notification_v2', parameters: Readonly<Record<string, unknown>>, signal: AbortSignal) => Promise<unknown>;
function receipt(v: unknown, attempt: NotificationSendGrant): DeliveryOutcome | null {
  if (!object(v) || !exact(v, ['kind', 'notificationId', 'attemptId', 'state', 'outcome']) || v.kind !== 'receipt' || v.notificationId !== attempt.notificationId || v.attemptId !== attempt.attemptId || !deliveryOutcome(v.outcome) || v.state !== v.outcome.kind || v.outcome.kind === 'accepted' && v.outcome.apnsId !== attempt.attemptId) return null;
  return v.outcome;
}
/** One finite notification-only tick, no task execution or autonomous retry loop. */
export async function runNotificationScheduler(options: Readonly<{ enabled?: boolean; rpc: NotificationRpc; transport: ReminderTransport; now?: () => Date }>, signal: AbortSignal): Promise<'disabled' | 'idle' | 'blocked' | 'accepted' | 'unknown' | 'error'> {
  if (options.enabled !== true || options.transport.available !== true) return 'disabled';
  if (signal.aborted) return 'blocked';
  const rpc: NotificationRpc = async (name, params, external) => {
    const scope = nativeRequestScope(external, 5000);
    try { return await scope.run(() => options.rpc(name, params, scope.signal)); } finally { scope.dispose(); }
  };
  let candidate: unknown;
  try { candidate = await rpc('poll_travel_notifications_v2', { p_limit: 1 }, signal); } catch { return 'unknown'; }
  if (object(candidate) && exact(candidate, ['kind']) && candidate.kind === 'idle') return 'idle';
  if (!object(candidate) || !exact(candidate, ['kind', 'notificationId']) || candidate.kind !== 'candidate' || !uuid(candidate.notificationId)) return 'blocked';
  const notificationId = candidate.notificationId, attemptId = randomUUID();
  let issued: Awaited<ReturnType<typeof beginNotificationSend>>;
  try { issued = await beginNotificationSend(rpc, notificationId, attemptId, signal); } catch { return 'unknown'; }
  if (!issued) return 'blocked';
  const { grant: attempt, permit } = issued;
  // No send follows a stale/aborted grant. The durable attempt remains unknown,
  // never put back into a retryable queue even when no network call happened.
  let outcome: DeliveryOutcome = { kind: 'unknown', code: 'ACK_UNKNOWN' };
  try {
    const binding = options.transport.binding;
    if (!binding || binding.environment !== attempt.environment || binding.topic !== attempt.topic) outcome = { kind: 'error', code: 'TRANSPORT_UNAVAILABLE' };
    else if (!signal.aborted && permit.canWrite()) {
      // A settled exchange retires its permit before resolving a known ACK.
      // Deadline/abort still destroys actual IO through the permit itself.
      const sending = nativeRequestScope(signal, Math.min(3000, Math.max(1, permit.remainingMs())));
      try { const result = await sending.run(() => options.transport.send({ token: attempt.token, apnsId: attemptId, notificationId, environment: attempt.environment, topic: attempt.topic, expiresAt: attempt.expiresAt, sendPermit: permit })); if (deliveryOutcome(result) && (result.kind !== 'accepted' || result.apnsId === attemptId)) outcome = result; } catch { /* uncertain transport, no automatic retry */ }
      finally { sending.dispose(); }
    }
  } finally { permit.close(); }
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
