import { createPrivateKey, sign } from 'node:crypto';
import { connect, type OutgoingHttpHeaders } from 'node:http2';
import { privateLockScreenPayload } from './contract.ts';
import { unavailableReminderTransport, type ReminderTransport, type DeliveryOutcome } from './delivery-contract.ts';
import { uuid, timestamp } from './wire.ts';

export type ApnsConfiguration = Readonly<{ teamId: string; keyId: string; topic: string; privateKey: string; environment: 'sandbox' | 'production' }>;
export type ApnsResponse = Readonly<{ status: number; apnsId: string | null; reason: string | null }>;
/** A synthetic exchange is injectable in tests; production origins are fixed. */
export type ApnsExchange = (request: Readonly<{ origin: string; headers: OutgoingHttpHeaders; payload: string; timeoutMs: number }>) => Promise<ApnsResponse>;
export const apnsExchange: ApnsExchange = request => new Promise((resolve, reject) => {
  const session = connect(request.origin, { minVersion: 'TLSv1.2' });
  let finished = false;
  const done = (response?: ApnsResponse) => {
    if (finished) return;
    finished = true; clearTimeout(timer); session.destroy();
    if (response) resolve(response); else reject(new Error('APNS_ACK_UNKNOWN'));
  };
  const timer = setTimeout(() => done(), request.timeoutMs);
  session.on('error', () => done());
  session.on('close', () => done());
  session.on('connect', () => {
    if (finished) return;
    try {
      const stream = session.request(request.headers);
      let status = 0, apnsId: string | null = null, body = '', bytes = 0;
      stream.setEncoding('utf8');
      stream.on('response', headers => {
        status = Number(headers[':status']);
        if (typeof headers['apns-id'] === 'string') apnsId = headers['apns-id'];
      });
      stream.on('data', (chunk: string) => { bytes += Buffer.byteLength(chunk); if (bytes > 4096) done(); else body += chunk; });
      stream.on('error', () => done());
      stream.on('aborted', () => done());
      stream.on('end', () => {
        let reason: string | null = null;
        if (body) { try { const v: unknown = JSON.parse(body); if (v && typeof v === 'object' && 'reason' in v && typeof v.reason === 'string') reason = v.reason; } catch { /* no raw body escapes */ } }
        done({ status, apnsId, reason });
      });
      stream.end(request.payload);
    } catch { done(); }
  });
});

/** No environment variable discovery, token upload or network occurs at construction. */
export function createApnsTransport(options: Readonly<{ enabled?: boolean; configuration?: ApnsConfiguration; exchange?: ApnsExchange; now?: () => Date }>): ReminderTransport {
  const c = options.configuration;
  if (options.enabled !== true || !c || !/^[A-Z0-9]{10}$/.test(c.teamId) || !/^[A-Z0-9]{10}$/.test(c.keyId) || !/^[A-Za-z0-9.-]{1,255}$/.test(c.topic) || !['sandbox', 'production'].includes(c.environment)) return unavailableReminderTransport;
  let key: ReturnType<typeof createPrivateKey>;
  try { key = createPrivateKey(c.privateKey); if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') return unavailableReminderTransport; } catch { return unavailableReminderTransport; }
  const clock = options.now ?? (() => new Date()), exchange = options.exchange ?? apnsExchange;
  let cachedToken = '', issuedAt = 0;
  return Object.freeze({ available: true, binding: Object.freeze({ environment: c.environment, topic: c.topic }), async send(input): Promise<DeliveryOutcome> {
    const now = clock(), seconds = Math.floor(now.getTime() / 1000);
    if (!Number.isFinite(seconds) || !uuid(input.apnsId) || !uuid(input.notificationId) || !/^[a-f0-9]{2,512}$/.test(input.token) || input.token.length % 2 !== 0 || input.environment !== c.environment || input.topic !== c.topic || !timestamp(input.expiresAt) || Date.parse(input.expiresAt) <= now.getTime()) return { kind: 'error', code: 'TRANSPORT_UNAVAILABLE' };
    try {
      if (!cachedToken || seconds < issuedAt || seconds - issuedAt >= 3000) {
        const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: c.keyId })).toString('base64url');
        const claims = Buffer.from(JSON.stringify({ iss: c.teamId, iat: seconds })).toString('base64url');
        const signed = `${header}.${claims}`;
        cachedToken = `${signed}.${sign('sha256', Buffer.from(signed), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
        issuedAt = seconds;
      }
      const response = await exchange({ origin: c.environment === 'sandbox' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com', timeoutMs: 3000,
        headers: { ':method': 'POST', ':path': `/3/device/${input.token}`, authorization: `bearer ${cachedToken}`, 'apns-topic': c.topic, 'apns-id': input.apnsId, 'apns-expiration': '0', 'apns-priority': '10', 'apns-push-type': 'alert', 'content-type': 'application/json' },
        payload: JSON.stringify({ aps: { alert: privateLockScreenPayload }, notificationRef: input.notificationId }),
      });
      if (response.status === 200 && response.apnsId?.toLowerCase() === input.apnsId) return { kind: 'accepted', apnsId: input.apnsId, acceptedAt: clock().toISOString() };
      if (response.status === 200 || !Number.isSafeInteger(response.status) || response.status < 400 || response.status > 599) return { kind: 'unknown', code: 'ACK_UNKNOWN' };
      if (response.status === 410 && response.reason === 'Unregistered' || response.status === 400 && ['BadDeviceToken', 'DeviceTokenNotForTopic'].includes(response.reason ?? '')) return { kind: 'error', code: 'TOKEN_REVOKED' };
      return { kind: 'error', code: 'PROVIDER_REJECTED' };
    } catch { return { kind: 'unknown', code: 'ACK_UNKNOWN' }; }
  } });
}
