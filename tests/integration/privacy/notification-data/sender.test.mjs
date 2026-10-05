import test from 'node:test';
import assert from 'node:assert/strict';
import { beginNotificationSend, decodeNotificationSendGrant } from '../../../../lib/server/privacy/notification-data/sender.ts';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const base = Date.parse('2026-10-06T01:00:00.000Z');
const grant = () => ({ kind: 'attempt', notificationId: id(1), attemptId: id(2), deviceRevision: 1, token: 'ab'.repeat(32), environment: 'sandbox',
  topic: 'fixture.only', expiresAt: new Date(base + 60000).toISOString(), authorizedAt: new Date(base).toISOString(),
  leaseExpiresAt: new Date(base + 5000).toISOString(), leaseBudgetMs: 5000 });

test('fenced sender rejects old/unbounded/mismatched DTOs before any send permit', () => {
  assert.ok(decodeNotificationSendGrant(grant(), id(1), id(2)));
  const old = grant(); delete old.leaseBudgetMs;
  assert.equal(decodeNotificationSendGrant(old, id(1), id(2)), null);
  for (const patch of [{ leaseBudgetMs: 0 }, { leaseBudgetMs: 5001 }, { attemptId: id(3) }, { notificationId: id(3) }, { deviceRevision: 0 },
    { token: 'abc' }, { leaseExpiresAt: new Date(base + 5001).toISOString() }, { expiresAt: new Date(base + 4999).toISOString() },
    { sourceOwner: id(3) }]) assert.equal(decodeNotificationSendGrant({ ...grant(), ...patch }, id(1), id(2)), null);
});

test('RPC start determines original monotonic deadline; transport transit and delayed replies consume it', async () => {
  let mono = 1000000000n;
  const rpc = async (name, input) => {
    assert.equal(name, 'dispatch_travel_notification_v2');
    assert.deepEqual(input, { p_notification: id(1), p_action: 'begin_fenced', p_input: { attemptId: id(2) } });
    mono += 4000000000n; return grant();
  };
  const result = await beginNotificationSend(rpc, id(1), id(2), new AbortController().signal, () => mono);
  assert.equal(result.permit.remainingMs(), 1000);
  mono += 1000000000n; assert.equal(result.permit.beginNetworkWrite(), false); result.permit.close();
  assert.equal(await beginNotificationSend(async () => { mono += 5000000000n; return grant(); }, id(1), id(2), new AbortController().signal, () => mono), null);
});

test('calendar drift cannot mint authority; aborted/blocked calls cannot return a token permit', async () => {
  let mono = 1000000000n;
  const realWall = Date.now;
  try {
    Date.now = () => -1000000000000;
    const result = await beginNotificationSend(async () => grant(), id(1), id(2), new AbortController().signal, () => mono);
    assert.equal(result.permit.remainingMs(), 5000);
    Date.now = () => 1000000000000;
    mono += 5000000000n; assert.equal(result.permit.canWrite(), false); result.permit.close();
  } finally { Date.now = realWall; }
  const stopped = new AbortController(); stopped.abort(); let calls = 0;
  assert.equal(await beginNotificationSend(async () => { calls++; return grant(); }, id(1), id(2), stopped.signal), null);
  assert.equal(calls, 0);
  assert.equal(await beginNotificationSend(async () => ({ kind: 'blocked' }), id(1), id(2), new AbortController().signal), null);
});
