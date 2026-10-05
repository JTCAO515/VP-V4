import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http2';
import { generateKeyPairSync } from 'node:crypto';
import { hrtime } from 'node:process';
import { apnsExchange, createApnsTransport } from '../../../../lib/server/notifications/apns.ts';
import { runNotificationScheduler } from '../../../../lib/server/notifications/scheduler.ts';
import { createNotificationSendPermit } from '../../../../lib/server/privacy/notification-data/send-budget.ts';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const freshPermit = () => createNotificationSendPermit(hrtime.bigint(), 5000, new AbortController().signal);
const exchangeInput = permit => ({ origin: 'http://127.0.0.1', headers: { ':method': 'POST', ':path': '/synthetic' }, payload: '{}', timeoutMs: 1000, sendPermit: permit });
function connection(beforeBody = () => {}) {
  const session = new EventEmitter(), stream = new EventEmitter(); let requests = 0, bodies = 0, destroyed = false;
  stream.setEncoding = () => {};
  stream.end = () => { bodies++; };
  session.request = () => { requests++; beforeBody(); return stream; };
  session.destroy = () => { destroyed = true; };
  return { session, stream, get requests() { return requests; }, get bodies() { return bodies; }, get destroyed() { return destroyed; } };
}

test('actual exchange entry rejects absent/copied permits before connecting; expired connect callback writes no headers/body', async () => {
  let calls = 0;
  await assert.rejects(apnsExchange(exchangeInput(undefined), () => { calls++; throw Error('must not connect'); }), /ACK_UNKNOWN/);
  const original = freshPermit();
  await assert.rejects(apnsExchange(exchangeInput({ ...original }), () => { calls++; throw Error('must not connect'); }), /ACK_UNKNOWN/);
  original.close(); assert.equal(calls, 0);
  let mono = 1000000000n;
  const permit = createNotificationSendPermit(mono, 5000, new AbortController().signal, () => mono), c = connection();
  const result = assert.rejects(apnsExchange(exchangeInput(permit), () => c.session), /ACK_UNKNOWN/);
  mono += 5000000000n; c.session.emit('connect'); await result;
  assert.equal(c.requests, 0); assert.equal(c.bodies, 0); assert.equal(c.destroyed, true);
});

test('same permit guards stream.end after a pre-expiry header start; in-flight data is not sent after abort/deadline', async () => {
  let mono = 1000000000n;
  const permit = createNotificationSendPermit(mono, 5000, new AbortController().signal, () => mono);
  const c = connection(() => { mono += 5000000000n; });
  const result = assert.rejects(apnsExchange(exchangeInput(permit), () => c.session), /ACK_UNKNOWN/);
  c.session.emit('connect'); await result;
  assert.equal(c.requests, 1, 'only headers initiated before deadline'); assert.equal(c.bodies, 0); assert.ok(c.destroyed);
  const stop = new AbortController(), second = createNotificationSendPermit(hrtime.bigint(), 5000, stop.signal), pending = connection();
  const aborted = assert.rejects(apnsExchange(exchangeInput(second), () => pending.session), /ACK_UNKNOWN/);
  pending.session.emit('connect'); assert.equal(pending.bodies, 1);
  stop.abort(); await aborted; assert.ok(pending.destroyed); assert.equal(second.canWrite(), false);
});

test('real loopback HTTP2 exchange accepts once, destroys session and retires same permit without Apple', async () => {
  let bodies = 0;
  const server = createServer(); server.on('stream', (stream, headers) => {
    assert.equal(headers[':path'], '/synthetic');
    let body = ''; stream.on('data', data => { body += data; });
    stream.on('end', () => { bodies++; assert.equal(body, '{}'); stream.respond({ ':status': 200, 'apns-id': id(1) }); stream.end(); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const permit = freshPermit();
  try {
    const result = await apnsExchange({ ...exchangeInput(permit), origin: `http://127.0.0.1:${server.address().port}` });
    assert.deepEqual(result, { status: 200, apnsId: id(1), reason: null }); assert.equal(bodies, 1); assert.equal(permit.canWrite(), false);
    await assert.rejects(apnsExchange({ ...exchangeInput(permit), origin: `http://127.0.0.1:${server.address().port}` }), /ACK_UNKNOWN/);
    assert.equal(bodies, 1);
  } finally { permit.close(); await new Promise(resolve => server.close(resolve)); }
});

const clock = () => new Date('2026-10-06T01:00:00.000Z');
const configuration = { teamId: 'SYNTHETIC1', keyId: 'SYNTHETIC2', topic: 'fixture.only', environment: 'sandbox',
  privateKey: generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ format: 'pem', type: 'pkcs8' }).toString() };
function port({ lostFinish = false, block = false } = {}) {
  let granted = false, saved = null, sends = 0; const calls = [];
  const rpc = async (name, input) => {
    calls.push(input.p_action ?? 'poll');
    if (name === 'poll_travel_notifications_v2') return { kind: 'candidate', notificationId: id(1) };
    const attemptId = input.p_input.attemptId;
    if (input.p_action === 'begin_fenced') {
      if (granted || block) return { kind: 'blocked' }; granted = true;
      return { kind: 'attempt', notificationId: id(1), attemptId, deviceRevision: 1, token: 'ab'.repeat(32), environment: 'sandbox', topic: 'fixture.only',
        authorizedAt: clock().toISOString(), leaseExpiresAt: new Date(clock().getTime() + 5000).toISOString(), expiresAt: new Date(clock().getTime() + 60000).toISOString(), leaseBudgetMs: 5000 };
    }
    if (input.p_action === 'finish') { saved = { kind: 'receipt', notificationId: id(1), attemptId, state: input.p_input.outcome.kind, outcome: input.p_input.outcome }; if (lostFinish) throw Error('synthetic ACK lost'); }
    return saved;
  };
  const transport = createApnsTransport({ enabled: true, configuration, now: clock, exchange: async request => {
    assert.equal(request.sendPermit.canWrite(), true); sends++;
    assert.deepEqual(Object.keys(JSON.parse(request.payload)).sort(), ['aps','notificationRef']);
    return { status: 200, apnsId: request.headers['apns-id'], reason: null };
  } });
  return { rpc, transport, calls, get sends() { return sends; } };
}

test('leased scheduler uses fenced begin and genuine permit once; lost finish ACK reads same attempt without resend', async () => {
  const p = port({ lostFinish: true });
  assert.equal(await runNotificationScheduler({ enabled: true, rpc: p.rpc, transport: p.transport, now: clock }, new AbortController().signal), 'accepted');
  assert.deepEqual(p.calls, ['poll','begin_fenced','finish','read']); assert.equal(p.sends, 1);
  assert.equal(await runNotificationScheduler({ enabled: true, rpc: p.rpc, transport: p.transport, now: clock }, new AbortController().signal), 'blocked');
  assert.equal(p.sends, 1);
  const blocked = port({ block: true });
  assert.equal(await runNotificationScheduler({ enabled: true, rpc: blocked.rpc, transport: blocked.transport }, new AbortController().signal), 'blocked');
  assert.equal(blocked.sends, 0);
});

test('factory missing/expired permit never calls exchange; uncertain provider result stays unknown with no retry', async () => {
  const input = { token: 'ab'.repeat(32), apnsId: id(1), notificationId: id(2), environment: 'sandbox', topic: 'fixture.only', expiresAt: new Date(clock().getTime() + 60000).toISOString() };
  let calls = 0;
  const transport = createApnsTransport({ enabled: true, configuration, now: clock, exchange: async () => { calls++; return { status: 200, apnsId: null, reason: null }; } });
  assert.deepEqual(await transport.send(input), { kind: 'error', code: 'TRANSPORT_UNAVAILABLE' });
  const expired = freshPermit(); expired.close();
  assert.deepEqual(await transport.send({ ...input, sendPermit: expired }), { kind: 'error', code: 'TRANSPORT_UNAVAILABLE' }); assert.equal(calls, 0);
  const permit = freshPermit();
  assert.deepEqual(await transport.send({ ...input, sendPermit: permit }), { kind: 'unknown', code: 'ACK_UNKNOWN' }); assert.equal(calls, 1); assert.equal(permit.canWrite(), false);
});
