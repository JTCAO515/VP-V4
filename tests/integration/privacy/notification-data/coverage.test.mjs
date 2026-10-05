import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODULE_CATALOG } from '../../../../lib/server/privacy/coverage/catalog.ts';
import { NOTIFICATION_CATALOG_VERSION, NOTIFICATION_MODULES, NOTIFICATION_MODULE_ORDER, validNotificationDataCoverageSelection,
  notificationDataCoverageRequestBody, notificationDataCoverageOutcome } from '../../../../lib/server/privacy/notification-data/coverage.ts';
import { NOTIFICATION_DATA_SCHEMA, NOTIFICATION_DATA_BOUNDARIES, notificationDataDigest, notificationDataEffectCounts } from '../../../../lib/server/privacy/notification-data/contract.ts';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = { ownerId: id(1), sessionId: id(2), mobileEpoch: 1 }, now = 1801800000000;
const command = { action: 'erase', scope: 'notification-trip-data/1', requestId: id(3), objectIds: [id(4)], previewDigest: 'b'.repeat(64), confirmed: true };
const bytes = '\n' + JSON.stringify(command);
const input = { schemaVersion: 'data-coverage/1', catalogVersion: NOTIFICATION_CATALOG_VERSION, actorId: actor.ownerId,
  sessionId: actor.sessionId, mobileEpoch: actor.mobileEpoch, moduleId: 'notifications', moduleVersion: NOTIFICATION_DATA_SCHEMA,
  operationId: command.requestId, action: 'delete', phase: 'execute', confirmed: true, tripId: null, commandBytes: bytes };

test('Native producer fixture upgrades original notification row, adds adjacent device/progress and preserves entire denominator', () => {
  const fixture = JSON.parse(readFileSync(new URL('../../../fixtures/privacy/notification-data/native-catalog-v4.json', import.meta.url)));
  const intended = MODULE_CATALOG.flatMap(module => module.id === 'notifications' ? NOTIFICATION_MODULES : [module]);
  assert.equal(fixture.catalogVersion, NOTIFICATION_CATALOG_VERSION); assert.equal(fixture.allUserDataCompleted, false);
  assert.deepEqual(fixture.modules, intended); assert.equal(fixture.modules.length, 34);
  assert.equal(new Set(fixture.modules.map(m => m.id)).size, 34);
  const first = fixture.modules.findIndex(m => m.id === 'notifications');
  assert.deepEqual(fixture.modules.slice(first, first + 3).map(m => m.id), NOTIFICATION_MODULE_ORDER);
  assert.equal(fixture.modules[first + 3].id, 'lifecycle');
  for (const descriptor of NOTIFICATION_MODULES) {
    assert.equal(descriptor.exportHandler, 'notification_data'); assert.equal(descriptor.deleteHandler, 'notification_data');
    assert.equal(descriptor.selection.length, 20); assert.ok(descriptor.missing.length > 0);
  }
});

test('exact module/selection consumes opaque recovery bytes; old metadata-only DTO cannot gain full data authority', () => {
  assert.equal(validNotificationDataCoverageSelection(input, command), true);
  for (const delta of [{ moduleId: 'notification_devices' }, { moduleVersion: 'coverage-module-export/1' }, { tripId: id(4) },
    { operationId: id(5) }, { action: 'export' }]) assert.equal(validNotificationDataCoverageSelection({ ...input, ...delta }, command), false);
  assert.equal(validNotificationDataCoverageSelection(input, { action: 'export', requestId: id(3), confirmed: true }), false);
  const recovery = notificationDataCoverageRequestBody({ ...input, phase: 'recover' });
  assert.equal(JSON.parse(recovery).mutationBytes, bytes); assert.deepEqual(JSON.parse(recovery).objectIds, command.objectIds);
  assert.equal(notificationDataDigest(JSON.parse(recovery).mutationBytes), notificationDataDigest(bytes));
});

test('coverage cannot classify pending fences or missing drain proof as scoped completion; unknown ACK remains unknown', () => {
  const selected = { input, command, handler: 'notification_data' };
  const binding = { schemaVersion: NOTIFICATION_DATA_SCHEMA, scope: command.scope, requestId: command.requestId, objectIds: command.objectIds, ...actor,
    sourceDigest: 'a'.repeat(64), previewDigest: command.previewDigest, capturedAt: now, expiresAt: now + 30000,
    boundaries: NOTIFICATION_DATA_BOUNDARIES[command.scope], allUserDataCompleted: false };
  const pending = { ...binding, kind: 'draining', state: 'fenced', requestDigest: notificationDataDigest(bytes), committedAt: now + 1 };
  assert.equal(notificationDataCoverageOutcome(selected, pending, now + 10), null);
  const receipt = { ...binding, kind: 'receipt', state: 'erased', requestDigest: notificationDataDigest(bytes), committedAt: now + 1, decidedAt: now + 2,
    effects: { ...Object.fromEntries(notificationDataEffectCounts.map(k => [k, 0])), drainedThrough: now + 2,
      drainProof: { protocol: 'monotonic-drain/1', generation: 1, waitMs: 5000, finishedAt: now + 2 }, tripMutation: 'none', businessResults: 'not_modified', providerCopies: 'not_recalled', deviceCopies: 'not_erased' } };
  assert.equal(notificationDataCoverageOutcome(selected, receipt, now + 10).state, 'scoped_complete');
  assert.equal(notificationDataCoverageOutcome(selected, { ...receipt, effects: { ...receipt.effects, drainedThrough: 0, drainProof: null } }, now + 10), null);
  const unknown = { schemaVersion: NOTIFICATION_DATA_SCHEMA, kind: 'unknown', scope: command.scope, requestId: command.requestId,
    objectIds: command.objectIds, ...actor, requestDigest: notificationDataDigest(bytes), allUserDataCompleted: false };
  assert.deepEqual(notificationDataCoverageOutcome({ ...selected, input: { ...input, phase: 'recover' } }, unknown, now + 10),
    { state: 'unknown', reason: 'NOTIFICATION_DATA_ACK_UNKNOWN' });
});
