import test from 'node:test';
import assert from 'node:assert/strict';
import { hrtime } from 'node:process';
import { createNotificationSendPermit, genuineNotificationSendPermit, waitNotificationDrain } from '../../../../lib/server/privacy/notification-data/send-budget.ts';
import { completeNotificationDrain, decodeNotificationDataDraining } from '../../../../lib/server/privacy/notification-data/drain.ts';
import { NOTIFICATION_DATA_SCHEMA, NOTIFICATION_DATA_BOUNDARIES, notificationDataDigest } from '../../../../lib/server/privacy/notification-data/contract.ts';
import { notificationDataEffectCounts, decodeNotificationDataReceipt } from '../../../../lib/server/privacy/notification-data/protocol.ts';

test('RPC transit uses original monotonic start; wall-clock drift, delayed connection and old bytes cannot renew send permit', () => {
  let clock = 1000000000n; const start = clock, signal = new AbortController().signal;
  clock += 4000000000n; // four seconds elapsed while grant RPC was in transit
  const permit = createNotificationSendPermit(start, 5000, signal, () => clock);
  assert.ok(genuineNotificationSendPermit(permit)); assert.equal(permit.remainingMs(), 1000);
  assert.equal(permit.beginNetworkWrite(), true); assert.equal(permit.beginNetworkWrite(), false, 'only one network request is authorized');
  const realWall = Date.now;
  try {
    Date.now = () => -1000000000000;
    clock += 1000000000n; // an asynchronous connect callback arrives at deadline
    assert.equal(permit.canWrite(), false); assert.equal(permit.remainingMs(), 0);
    Date.now = () => 1000000000000;
    assert.equal(permit.canWrite(), false);
    assert.equal(createNotificationSendPermit(start, 5000, signal, () => clock), null);
    assert.equal(genuineNotificationSendPermit({ ...permit }), false, 'copied/serialized DTO cannot mint in-process capability');
  } finally { Date.now = realWall; permit.close(); }
  assert.equal(createNotificationSendPermit(clock, 5001, signal, () => clock), null);
  assert.equal(createNotificationSendPermit(clock + 1n, 5000, signal, () => clock), null);
});

test('abort, backward monotonic clock and closed transport permanently invalidate permit', () => {
  let clock = 1000000000n; const stop = new AbortController();
  const p = createNotificationSendPermit(clock, 5000, stop.signal, () => clock);
  assert.ok(p.canWrite()); stop.abort(); assert.equal(p.canWrite(), false); p.close();
  const q = createNotificationSendPermit(clock, 5000, new AbortController().signal, () => clock);
  clock--; assert.equal(q.canWrite(), false); clock += 1000n; assert.equal(q.canWrite(), false); q.close();
});

test('trusted drain waits complete monotonic upper bound even if timers wake early; cancellation cannot create a proof', async () => {
  let clock = 0n, calls = 0;
  await waitNotificationDrain(5000, new AbortController().signal, () => clock, async ms => { clock += BigInt(Math.floor(ms / 2) || 1) * 1000000n; calls++; });
  assert.ok(clock >= 5000000000n); assert.ok(calls > 100);
  const stop = new AbortController(); clock = 0n;
  await assert.rejects(waitNotificationDrain(5000, stop.signal, () => clock, async ms => { clock += BigInt(ms) * 1000000n; stop.abort(); }), /DRAIN_UNAVAILABLE/);
  await assert.rejects(waitNotificationDrain(4999, new AbortController().signal), /DRAIN_UNAVAILABLE/);
});

test('real process monotonic drain satisfies full server barrier interval', async () => {
  const start = hrtime.bigint();
  await waitNotificationDrain(5000, new AbortController().signal);
  assert.ok(hrtime.bigint() - start >= 5000000000n);
});

test('service finalization binds durable fence/challenge generation; owner bytes and calendar expiry alone are not proof', async () => {
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const actor = { ownerId: id(1), sessionId: id(2), mobileEpoch: 1 }, now = 1801800000000;
  const selection = { scope: 'notification-trip-data/1', requestId: id(3), objectIds: [id(4)] };
  const bytes = JSON.stringify({ ...selection, action: 'erase', previewDigest: 'b'.repeat(64), confirmed: true });
  const binding = { schemaVersion: NOTIFICATION_DATA_SCHEMA, ...selection, ...actor, sourceDigest: 'a'.repeat(64), previewDigest: 'b'.repeat(64),
    capturedAt: now, expiresAt: now + 30000, boundaries: NOTIFICATION_DATA_BOUNDARIES[selection.scope], allUserDataCompleted: false };
  const pending = { ...binding, kind: 'draining', state: 'fenced', requestDigest: notificationDataDigest(bytes), committedAt: now + 1 };
  assert.ok(decodeNotificationDataDraining(pending, selection, actor, bytes, now + 2));
  assert.equal(decodeNotificationDataReceipt(pending, selection, actor, notificationDataDigest(bytes), now + 2), null);
  const challenge = { kind: 'drain_challenge', protocol: 'monotonic-drain/1', ...actor, requestId: selection.requestId,
    requestDigest: notificationDataDigest(bytes), generation: 1, nonce: 'c'.repeat(64), waitMs: 5000 };
  const result = { ...binding, kind: 'receipt', state: 'erased', requestDigest: notificationDataDigest(bytes), committedAt: now + 1, decidedAt: now + 60000,
    effects: { ...Object.fromEntries(notificationDataEffectCounts.map(k => [k, 0])), drainedThrough: now + 60000,
      drainProof: { protocol: 'monotonic-drain/1', generation: 1, waitMs: 5000, finishedAt: now + 60000 }, tripMutation: 'none', businessResults: 'not_modified', providerCopies: 'not_recalled', deviceCopies: 'not_erased' } };
  let tick = 0n, finish = 0;
  const rpc = async (action, input) => {
    if (action === 'begin') return challenge;
    assert.ok(tick >= 5000000000n); assert.equal(input.nonce, challenge.nonce); assert.equal(input.generation, 1);
    finish++; return result;
  };
  const receipt = await completeNotificationDrain(selection, actor, bytes, rpc, new AbortController().signal, async () => true, () => now + 60000,
    { clock: () => tick, wait: async ms => { tick += BigInt(ms) * 1000000n; } });
  assert.equal(finish, 1); assert.equal(receipt.effects.drainProof.waitMs, 5000);
  assert.ok(decodeNotificationDataReceipt(receipt, selection, actor, notificationDataDigest(bytes), now + 60000), 'original source erase committed before TTL; later completion does not renew preview');
  await assert.rejects(completeNotificationDrain(selection, actor, bytes, async () => ({ ...challenge, waitMs: 0 }), new AbortController().signal, async () => true), /ACK_UNKNOWN/);
  assert.equal(finish, 1);
  const forged = structuredClone(receipt); forged.committedAt = binding.expiresAt;
  assert.equal(decodeNotificationDataReceipt(forged, selection, actor, notificationDataDigest(bytes), now + 60000), null);
});
