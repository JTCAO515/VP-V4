import test from 'node:test';
import assert from 'node:assert/strict';
import { handleNotificationData, notificationDataNativeHTTP } from '../../../../lib/server/privacy/notification-data/http.ts';
import { NOTIFICATION_DATA_SCHEMA, NOTIFICATION_DATA_BOUNDARIES, NOTIFICATION_DATA_LIMITS, parseNotificationDataCommand, notificationDataDigest } from '../../../../lib/server/privacy/notification-data/contract.ts';
import { decodeNotificationDataPreview, decodeNotificationDataBundle, decodeNotificationDataReceipt, notificationDataEffectCounts } from '../../../../lib/server/privacy/notification-data/protocol.ts';

// Synthetic protocol fixtures: no target identity, SQL/worker or provider proof.
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = 1801800000000;
const stamp = n => new Date(now + n).toISOString();
const actor = { ownerId: id(1), sessionId: id(2), mobileEpoch: 3 };
const scope = 'notification-trip-data/1';
const objectIds = Array.from({ length: 6 }, (_, i) => id(i + 10));
const selection = { scope, requestId: id(99), objectIds };
const binding = { schemaVersion: NOTIFICATION_DATA_SCHEMA, ...selection, ...actor, sourceDigest: 'a'.repeat(64), previewDigest: 'b'.repeat(64),
  capturedAt: now, expiresAt: now + 30000, boundaries: NOTIFICATION_DATA_BOUNDARIES[scope], allUserDataCompleted: false };
const command = action => action === 'preview' ? { ...selection, action } : { ...selection, action, previewDigest: binding.previewDigest, confirmed: true };
const item = trip => ({ objectId: trip, reminders: [], watches: [], dismissals: [], outbox: [], attempts: [], operations: [], travelReminders: [], fences: [] });
const items = objectIds.map(item);
const preview = () => ({ ...binding, kind: 'preview', items: structuredClone(items), requiresExplicitConfirmation: true });
const effects = () => ({ ...Object.fromEntries(notificationDataEffectCounts.map(k => [k, 0])), drainedThrough: now + 1, drainProof: { protocol: 'monotonic-drain/1', generation: 1, waitMs: 5000, finishedAt: now + 1 }, tripMutation: 'none',
  businessResults: 'not_modified', providerCopies: 'not_recalled', deviceCopies: 'not_erased' });
const receipt = bytes => ({ ...binding, kind: 'receipt', state: 'erased', requestDigest: notificationDataDigest(bytes), committedAt: now + 1, decidedAt: now + 1, effects: effects() });
const request = (body, headers = {}) => new Request('http://127.0.0.1/api/privacy/native/v1/notification-data', {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body),
});
const options = (rpc, current = async () => true, authenticate = async () => actor) => ({ enabled: true, now: () => now + 10, authority: () => ({ rpc, current, authenticate }) });
function exporting(change = v => v, currentItems = items) {
  let digest, page = 0;
  return async (action, bytes) => {
    if (action === 'preview') return change(preview(), action);
    if (action === 'erase' || action === 'recover') return change(receipt(action === 'recover' ? JSON.parse(bytes).mutationBytes : bytes), action);
    if (action === 'export_start') {
      digest = notificationDataDigest(bytes);
      return change({ ...binding, kind: 'started', requestDigest: digest, limits: { pageSize: 5, maxPages: 4, maxRows: 20, maxBytes: 1000000 } }, action);
    }
    if (action === 'page') {
      const input = JSON.parse(bytes);
      assert.equal(input.sourceDigest, binding.sourceDigest);
      assert.equal(input.previewDigest, binding.previewDigest);
      const rows = structuredClone(currentItems.slice(page * 5, page * 5 + 5));
      const hasMore = ++page === 1;
      return change({ ...binding, kind: 'page', requestDigest: digest, items: rows, hasMore, sectionComplete: !hasMore, pageNumber: page,
        nextCursor: hasMore ? { sourceDigest: binding.sourceDigest, afterId: rows.at(-1).objectId } : null }, action);
    }
    assert.equal(action, 'proof');
    return change({ ...binding, kind: 'proof', requestDigest: digest, coverage: 'complete', pages: 2, rows: 6 }, action);
  };
}

test('closed explicit scopes reject actor injection, bulk/unsorted/duplicate selection and changed recovery bytes', () => {
  const erase = command('erase'), bytes = '\n' + JSON.stringify(erase);
  assert.deepEqual(parseNotificationDataCommand(erase), erase);
  const recovery = { ...selection, action: 'recover', mutationBytes: bytes };
  assert.deepEqual(parseNotificationDataCommand(recovery), recovery);
  for (const delta of [{ ownerId: actor.ownerId }, { all: true }, { confirmed: false }, { objectIds: [...objectIds].reverse() },
    { objectIds: [objectIds[0], objectIds[0]] }, { objectIds: [] }, { objectIds: Array.from({ length: 21 }, (_, n) => id(200 + n)) },
    { scope: 'notification-metadata/1' }, { sourceDigest: binding.sourceDigest }]) assert.equal(parseNotificationDataCommand({ ...erase, ...delta }), null);
  assert.equal(parseNotificationDataCommand({ ...recovery, requestId: id(100) }), null);
  assert.equal(parseNotificationDataCommand({ ...recovery, mutationBytes: JSON.stringify(command('export')) }), null);
  assert.equal(parseNotificationDataCommand({ ...recovery, mutationBytes: JSON.stringify(recovery) }), null);
});

test('actual table mirrors reject omissions, cross-owner edges, wrong receipts and malformed active leases', () => {
  const p = preview(), group = p.items[0], trip = group.objectId;
  const reminder = { id: id(200), owner_id: actor.ownerId, trip_id: trip, user_reminder_id: null, operation_id: id(201), session_id: actor.sessionId,
    epoch: actor.mobileEpoch, base_version: 1, purpose: 'accepted_task_result', source: { kind: 'task_result', sourceId: id(202), revision: 1, contentDigest: 'c'.repeat(64) },
    reason: null, due_at: stamp(0), expires_at: stamp(60000), time_zone: 'Asia/Shanghai', quiet_hours: { startMinute: 0, endMinute: 0 }, consent_at: stamp(0),
    status: 'saved', revision: 1, created_at: stamp(0) };
  group.reminders.push(reminder);
  group.outbox.push({ id: id(203), reminder_id: reminder.id, device_id: id(204), device_revision: 1, recheck_receipt_id: null, recheck_review_digest: null,
    state: 'attempting', outcome: null, watch_id: null, semantic_digest: null, created_at: stamp(0) });
  group.attempts.push({ notification_id: id(203), attempt_id: id(205), device_id: id(204), device_revision: 1, state: 'attempting', outcome: null,
    authorized_at: stamp(0), lease_expires_at: stamp(5000) });
  assert.ok(decodeNotificationDataPreview(p, selection, actor, now + 10));
  for (const mutate of [v => delete v.items[0].reminders[0].reason, v => v.items[0].reminders[0].owner_id = id(900),
    v => v.items[0].outbox[0].reminder_id = id(900), v => v.items[0].attempts[0].device_id = id(900),
    v => v.items[0].attempts[0].lease_expires_at = stamp(5001), v => v.items[0].unknownColumn = 'hidden',
    v => v.boundaries.missing = [], v => v.allUserDataCompleted = true]) {
    const altered = structuredClone(p); mutate(altered); assert.equal(decodeNotificationDataPreview(altered, selection, actor, now + 10), null);
  }
});

test('export preserves original byte digest and only exposes complete ordered source-bound proof', async () => {
  const bytes = '\t\n' + JSON.stringify(command('export'));
  const response = await handleNotificationData(request(bytes), options(exporting()));
  assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /private, no-store/);
  const bundle = (await response.json()).data;
  assert.equal(bundle.requestDigest, notificationDataDigest(bytes)); assert.deepEqual(bundle.proof, { coverage: 'complete', pages: 2, rows: 6 });
  assert.ok(decodeNotificationDataBundle(bundle, selection, actor, now + 10));
  for (const change of [(v, action) => { if (action === 'proof') v.rows--; return v; },
    (v, action) => { if (action === 'page') v.sourceDigest = 'f'.repeat(64); return v; },
    (v, action) => { if (action === 'page') v.items.reverse(); return v; },
    (v, action) => { if (action === 'page') v.hasMore = false; return v; },
    (v, action) => { if (action === 'export_start') v.expiresAt++; return v; },
    (v, action) => { if (action === 'proof') v.ownerId = id(900); return v; }]) {
    const invalid = await handleNotificationData(request(bytes), options(exporting(change)));
    assert.equal(invalid.status, 503); assert.ok(!(await invalid.json()).data);
  }
});

test('erase missing ACK/current-actor change never invent completion; recovery uses exact bytes and expired immutable receipt', async () => {
  const bytes = '\n' + JSON.stringify(command('erase')); let applied = false;
  const response = await handleNotificationData(request(bytes), options(async () => { applied = true; return receipt(bytes); }, async () => !applied));
  assert.equal(response.status, 503); assert.equal((await response.json()).error.code, 'NOTIFICATION_DATA_ACK_UNKNOWN');
  const recover = { ...selection, action: 'recover', mutationBytes: bytes };
  const recovery = await handleNotificationData(request(recover), { ...options(exporting()), now: () => now + 60000 });
  assert.equal(recovery.status, 200); assert.deepEqual((await recovery.json()).data, receipt(bytes));
  const unknown = { schemaVersion: NOTIFICATION_DATA_SCHEMA, kind: 'unknown', ...selection, ...actor,
    requestDigest: notificationDataDigest(bytes), allUserDataCompleted: false };
  const unresolved = await handleNotificationData(request(recover), options(async () => unknown));
  assert.equal(unresolved.status, 200); assert.equal((await unresolved.json()).data.kind, 'unknown');
  for (const mutate of [v => v.state = 'cancelled', v => v.effects.drainedThrough = now + 100, v => v.effects.deviceCopies = 'erased',
    v => v.requestDigest = notificationDataDigest(' ' + bytes), v => v.ownerId = id(900)]) {
    const result = receipt(bytes); mutate(result);
    assert.equal(decodeNotificationDataReceipt(result, selection, actor, notificationDataDigest(bytes), now + 10), null);
    assert.equal((await handleNotificationData(request(bytes), options(async () => result))).status, 503);
  }
});

test('admission and real current credentials precede dispatch; default runtime is disabled and unsafe errors are redacted', async () => {
  let calls = 0;
  const rpc = async () => { calls++; throw Error('sensitive source body secret'); };
  assert.equal((await handleNotificationData(request(command('erase')), options(rpc, async () => true, async () => null))).status, 401);
  assert.equal((await handleNotificationData(request(command('erase')), options(rpc, async () => false))).status, 401);
  assert.equal((await handleNotificationData(request(command('erase'), { Cookie: 'ambiguous=1' }), options(rpc))).status, 400);
  assert.equal((await handleNotificationData(request(command('erase'), { Origin: 'http://other.example' }), options(rpc))).status, 400);
  assert.equal((await handleNotificationData(request({ ...command('erase'), confirmed: false }), options(rpc))).status, 400);
  assert.equal(calls, 0);
  assert.equal((await notificationDataNativeHTTP(request(command('erase')))).status, 503);
  const denied = await handleNotificationData(request(command('preview')), options(rpc));
  assert.equal((await denied.json()).error.code, 'NOTIFICATION_DATA_UNAVAILABLE');
  assert.equal(NOTIFICATION_DATA_LIMITS.lifetimeMs, 30000);
});
