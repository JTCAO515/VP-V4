import { createClient } from '@supabase/supabase-js';
import { exact, record, uuid, hash } from '../../guide/contract.ts';
import { isLocalNativeTarget } from '../../identity/native-config.ts';
import { notificationDataBindingKeys, validNotificationDataBinding, sameNotificationDataSelection, notificationDataDigest, positive,
  type NotificationDataActor, type NotificationDataSelection } from './contract.ts';
import { decodeNotificationDataReceipt, type NotificationDataReceipt } from './protocol.ts';
import { waitNotificationDrain, type MonotonicClock } from './send-budget.ts';

export type NotificationDrainRPC = (action: 'begin' | 'finish', input: Readonly<Record<string, unknown>>, signal: AbortSignal) => Promise<unknown>;
/** Owner DTO cannot turn a pending fence into success. Only the separately
 * authenticated existing server credential may complete this bounded barrier. */
export function decodeNotificationDataDraining(v: unknown, selection: NotificationDataSelection, actor: NotificationDataActor, bytes: string, now: number): boolean {
  return selection.scope !== 'notification-exit-progress/1' && record(v) && exact(v, [...notificationDataBindingKeys,'kind','state','requestDigest','committedAt']) && validNotificationDataBinding(v, now, true)
    && sameNotificationDataSelection(v, selection, actor) && v.kind === 'draining' && v.state === 'fenced'
    && v.requestDigest === notificationDataDigest(bytes) && positive(v.committedAt) && v.committedAt >= v.capturedAt && v.committedAt < v.expiresAt && v.committedAt <= now;
}
export async function completeNotificationDrain(selection: NotificationDataSelection, actor: NotificationDataActor, bytes: string,
  rpc: NotificationDrainRPC, signal: AbortSignal, current: () => Promise<boolean>, now = Date.now,
  timing?: Readonly<{ clock: MonotonicClock; wait(milliseconds: number): Promise<void> }>): Promise<NotificationDataReceipt> {
  const input = { ownerId: actor.ownerId, sessionId: actor.sessionId, mobileEpoch: actor.mobileEpoch, requestId: selection.requestId,
    scope: selection.scope, objectIds: selection.objectIds, requestDigest: notificationDataDigest(bytes) };
  const invoke = async (action: 'begin' | 'finish', value: Readonly<Record<string, unknown>>) => {
    if (signal.aborted || !await current()) throw Error('NOTIFICATION_DATA_ACK_UNKNOWN');
    const result = await rpc(action, value, signal);
    if (signal.aborted || !await current()) throw Error('NOTIFICATION_DATA_ACK_UNKNOWN');
    return result;
  };
  const challenge = await invoke('begin', input);
  // After a lost finish ACK, immutable terminal receipt needs no renewed wait.
  const completed = decodeNotificationDataReceipt(challenge, selection, actor, input.requestDigest, now());
  if (completed) return completed;
  if (!record(challenge) || !exact(challenge, ['kind','protocol','ownerId','sessionId','mobileEpoch','requestId','requestDigest','generation','nonce','waitMs'])
    || challenge.kind !== 'drain_challenge' || challenge.protocol !== 'monotonic-drain/1' || challenge.ownerId !== actor.ownerId
    || challenge.sessionId !== actor.sessionId || challenge.mobileEpoch !== actor.mobileEpoch || challenge.requestId !== selection.requestId
    || challenge.requestDigest !== input.requestDigest || !positive(challenge.generation) || !hash(challenge.nonce) || challenge.waitMs !== 5000) throw Error('NOTIFICATION_DATA_ACK_UNKNOWN');
  // Start AFTER the durable fence/challenge response. Network delay only adds
  // drain time. No SQL timestamp or worker/client wall clock is a duration proof.
  await waitNotificationDrain(challenge.waitMs, signal, timing?.clock, timing?.wait);
  const result = await invoke('finish', { ...input, generation: challenge.generation, nonce: challenge.nonce });
  const receipt = decodeNotificationDataReceipt(result, selection, actor, input.requestDigest, now());
  if (!receipt || receipt.effects.drainProof?.generation !== challenge.generation) throw Error('NOTIFICATION_DATA_ACK_UNKNOWN');
  return receipt;
}

/** Reuses only the existing selected LOCAL native service key; no discovery,
 * endpoint from DTO, key creation, target capability or automatic enablement. */
export function notificationDrainRPC(options: Readonly<{ enabled: boolean; url: string; serviceKey?: string }>, fetcher: typeof fetch): NotificationDrainRPC | null {
  if (!options.enabled || !options.serviceKey || !isLocalNativeTarget(options.url)) return null;
  const client = createClient(options.url, options.serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  return async (action, input, signal) => {
    if (signal.aborted || !uuid(input.requestId)) throw Error('NOTIFICATION_DATA_ACK_UNKNOWN');
    const response = await client.rpc('privacy_notification_data_drain_v1', { p_action: action, p_input: input }).abortSignal(signal);
    if (response.error) throw Error('NOTIFICATION_DATA_ACK_UNKNOWN');
    return response.data;
  };
}
