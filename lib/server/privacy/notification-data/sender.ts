import { hrtime } from 'node:process';
import { exact, object, uuid, integer, timestamp } from '../../notifications/wire.ts';
import type { NotificationRpc } from '../../notifications/scheduler.ts';
import { createNotificationSendPermit, NOTIFICATION_SEND_BUDGET_MS, type NotificationSendPermit, type MonotonicClock } from './send-budget.ts';

export type NotificationSendGrant = Readonly<{
  kind: 'attempt'; notificationId: string; attemptId: string; deviceRevision: number; token: string;
  environment: 'sandbox' | 'production'; topic: string; expiresAt: string; authorizedAt: string; leaseExpiresAt: string; leaseBudgetMs: number;
}>;
/** Calendar timestamps constrain the DB-issued original interval only. Send
 * authorization is the single process-local monotonic permit, never Date.now. */
export function decodeNotificationSendGrant(v: unknown, notificationId: string, attemptId: string): NotificationSendGrant | null {
  if (!object(v) || !exact(v, ['kind','notificationId','attemptId','deviceRevision','token','environment','topic','expiresAt','authorizedAt','leaseExpiresAt','leaseBudgetMs'])
    || v.kind !== 'attempt' || v.notificationId !== notificationId || v.attemptId !== attemptId || !uuid(notificationId) || !uuid(attemptId)
    || !integer(v.deviceRevision, 1) || typeof v.token !== 'string' || !/^[a-f0-9]{2,512}$/.test(v.token) || v.token.length % 2 !== 0
    || !['sandbox','production'].includes(String(v.environment)) || typeof v.topic !== 'string' || !/^[A-Za-z0-9.-]{1,200}$/.test(v.topic)
    || !timestamp(v.authorizedAt) || !timestamp(v.leaseExpiresAt) || !timestamp(v.expiresAt) || typeof v.leaseBudgetMs !== 'number' || !integer(v.leaseBudgetMs, 1)) return null;
  const originalInterval = Math.min(Date.parse(v.leaseExpiresAt), Date.parse(v.expiresAt)) - Date.parse(v.authorizedAt);
  if (originalInterval <= 0 || originalInterval > NOTIFICATION_SEND_BUDGET_MS || v.leaseBudgetMs > originalInterval) return null;
  return v as NotificationSendGrant;
}

/** Only a newly issued fenced grant can mint a permit. Old attempt DTOs, a replay
 * RPC reply, late response or new wall-clock reading cannot renew the deadline. */
export async function beginNotificationSend(rpc: NotificationRpc, notificationId: string, attemptId: string, signal: AbortSignal,
  clock: MonotonicClock = hrtime.bigint): Promise<Readonly<{ grant: NotificationSendGrant; permit: NotificationSendPermit }> | null> {
  if (signal.aborted || !uuid(notificationId) || !uuid(attemptId)) return null;
  const startedNs = clock();
  const value = await rpc('dispatch_travel_notification_v2', { p_notification: notificationId, p_action: 'begin_fenced', p_input: { attemptId } }, signal);
  const grant = decodeNotificationSendGrant(value, notificationId, attemptId);
  if (!grant || signal.aborted) return null;
  const permit = createNotificationSendPermit(startedNs, grant.leaseBudgetMs, signal, clock);
  return permit ? { grant, permit } : null;
}
