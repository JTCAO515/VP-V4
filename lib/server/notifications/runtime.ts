import { createApnsTransport, type ApnsConfiguration, type ApnsExchange } from './apns.ts';
import { runNotificationScheduler, type NotificationRpc } from './scheduler.ts';

/** Dedicated configuration reader; merely having keys cannot enable delivery. */
export function configuredNotificationTransport(environment: Readonly<Record<string, string | undefined>> = process.env) {
  const enabled = environment.VISEPANDA_REMINDER_DELIVERY_ENABLED === 'true';
  const target = environment.VISEPANDA_REMINDER_APNS_ENVIRONMENT;
  const teamId = environment.VISEPANDA_REMINDER_APNS_TEAM_ID, keyId = environment.VISEPANDA_REMINDER_APNS_KEY_ID;
  const topic = environment.VISEPANDA_REMINDER_APNS_TOPIC, privateKey = environment.VISEPANDA_REMINDER_APNS_PRIVATE_KEY;
  return createApnsTransport({ enabled, configuration: enabled && teamId && keyId && topic && privateKey && (target === 'sandbox' || target === 'production') ? { teamId, keyId, topic, privateKey, environment: target } : undefined });
}

/** A dedicated host composes its authorized RPC and APNs credentials explicitly.
 * No global config, credentials discovery, existing worker startup or interval. */
export function createNotificationRuntime(options: Readonly<{ enabled?: boolean; configuration?: ApnsConfiguration; rpc: NotificationRpc; exchange?: ApnsExchange; now?: () => Date }>) {
  const transport = createApnsTransport(options);
  return Object.freeze({ available: options.enabled === true && transport.available,
    tick(signal: AbortSignal) { return runNotificationScheduler({ enabled: options.enabled, rpc: options.rpc, transport, now: options.now }, signal); },
  });
}
