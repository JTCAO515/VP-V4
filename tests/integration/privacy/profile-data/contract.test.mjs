import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProfileCommand, profileDigest } from '../../../../lib/server/privacy/profile-data/contract.ts';
import { decodeProfilePreview, decodeProfileReceipt, decodeProfileList, validOperationRow } from '../../../../lib/server/privacy/profile-data/protocol.ts';
import { handleProfileData } from '../../../../lib/server/privacy/profile-data/http.ts';
import { profileCoverageOutcome, profileCoverageRequestBody, validProfileCoverageSelection } from '../../../../lib/server/privacy/profile-data/coverage.ts';
import { id, now, actor, selection, command, bytes, summary, profile, preview, receipt, decision, recover, unknown, operation, list,
  progressSelection, progressCommand, progressBytes, progressPreview, progressReceipt } from './fixtures.mjs';
const request = v => new Request('http://localhost/api/privacy/native/v1/profile-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof v === 'string' ? v : JSON.stringify(v) });
const options = rpc => ({ enabled: true, now: () => now + 20, authority: () => ({ authenticate: async () => actor, current: async () => true, rpc }) });

test('closed explicit Profile selection preserves original bytes and rejects nested recovery/authority/coercion', () => {
  assert.deepEqual(parseProfileCommand(command), command);
  assert.equal(parseProfileCommand(recover()).mutationBytes, bytes);
  for (const change of [{ action: ['erase'] }, { ownerId: id(99) }, { confirmed: false }, { profileId: null }, { objectIds: [id(8)] },
    { sourceDigest: null }, { requestId: 'A'.repeat(36) }]) assert.equal(parseProfileCommand({ ...command, ...change }), null);
  assert.equal(parseProfileCommand({ ...recover(), profileId: id(99) }), null);
  assert.equal(parseProfileCommand({ ...recover(), mutationBytes: JSON.stringify(recover()) }), null);
  assert.equal(parseProfileCommand({ ...progressCommand, objectIds: [progressSelection.requestId] }), null);
  assert.equal(parseProfileCommand({ ...progressCommand, objectIds: [id(5), id(4)] }), null);
});

test('owner preview exposes all fields/pace history, exact fixed30s and declared mixed-copy effects', () => {
  const c = { action: 'preview', ...selection };
  assert.ok(decodeProfilePreview(preview(), c, actor, now + 1));
  assert.ok(decodeProfilePreview({ ...preview(), profile: { ...profile, displayName: '🐼'.repeat(80) } }, c, actor, now + 1), 'legacy SQL char_length permits 80 Unicode code points');
  assert.equal(decodeProfilePreview({ ...preview(), profile: { ...profile, displayName: '🐼'.repeat(81) } }, c, actor, now + 1), null);
  assert.ok(decodeProfilePreview({ ...preview(), conflicts: ['ACTIVE_PROFILE_USE'], eligible: false }, c, actor, now + 1));
  for (const change of [{ ownerId: id(90) }, { profileId: id(90) }, { mobileEpoch: 4 }, { expiresAt: now + 60000 }, { allUserDataCompleted: true },
    { profile: { ...profile, paceRequest: { ...profile.paceRequest, ownerId: actor.ownerId } } }, { summary: { ...summary, hasPaceUndo: false } },
    { summary: { ...summary, presentFields: ['currency', 'locale'] } }, { profile: { ...profile, paceNotice: null } },
    { copies: { ...preview().copies, mysteryTable: [] } }, { boundaries: { ...preview().boundaries, retained: [] } }])
    assert.equal(decodeProfilePreview({ ...preview(), ...change }, c, actor, now + 1), null);
  assert.equal(decodeProfilePreview(preview(), c, actor, now + 30000), null);
});

test('committed receipt recovers past TTL only with original bytes and monotonic versions; no fake external/account cleanup', () => {
  assert.ok(decodeProfileReceipt(receipt(), command, actor, profileDigest(bytes), now + 40000));
  for (const change of [{ afterPaceRevision: 0 }, { afterProfileRevision: 4 }, { erasedFields: [] }, { paceConsent: 'explicit' },
    { account: 'erased' }, { sourceTrip: 'erased' }, { explicitMemory: 'erased' }, { externalCopies: 'erased' },
    { decidedAt: now + 30000 }, { requestDigest: profileDigest(JSON.stringify(command)) }, { retainedFences: 0 },
    { retainedCopies: preview().copies }]) assert.equal(decodeProfileReceipt({ ...receipt(), decision: { ...decision(), ...change } }, command, actor, profileDigest(bytes), now + 40000), null);
  assert.equal(decodeProfileReceipt({ ...receipt(), sourceDigest: 'c'.repeat(64) }, command, actor, profileDigest(bytes), now + 20), null);
});

test('progress inventory includes every persisted finite field; cleanup preserves permanent decision/fence and never modifies Profile', () => {
  assert.ok(validOperationRow(operation(), actor.ownerId, now + 40000));
  for (const change of [{ mutationBytes: bytes }, { profile }, { previewErased: false }, { decision: { ...decision(), receipt: receipt() } }])
    assert.equal(validOperationRow({ ...operation(), ...change }, actor.ownerId, now + 40000), false);
  const c = { action: 'list', scope: progressSelection.scope, cursor: null, limit: 20 };
  assert.ok(decodeProfileList(list(), c, actor, now + 40001));
  assert.equal(decodeProfileList({ ...list(), items: [operation(), operation()] }, c, actor, now + 40001), null);
  assert.equal(decodeProfileList({ ...list(), hasMore: true, nextCursor: { sourceDigest: list().sourceDigest, afterId: selection.requestId } }, c, actor, now + 40001), null);
  assert.ok(decodeProfilePreview(progressPreview(), { action: 'preview', ...progressSelection }, actor, now + 1));
  assert.ok(decodeProfileReceipt(progressReceipt(), progressCommand, actor, profileDigest(progressBytes), now + 20));
  assert.equal(decodeProfileReceipt({ ...progressReceipt(), decision: { ...progressReceipt().decision, sourceProfile: 'cleared' } }, progressCommand, actor, profileDigest(progressBytes), now + 20), null);
});

test('mutation dispatch is once, byte-preserving; lost/malformed ACK remains unknown, exact recovery accepts original terminal proof', async () => {
  let calls = 0;
  const good = await handleProfileData(request(bytes), options(async (action, raw) => { calls++; assert.equal(action, 'erase'); assert.equal(raw, bytes); return receipt(); }));
  assert.equal(good.status, 200); assert.equal(calls, 1); assert.equal(good.headers.get('Cache-Control'), 'private, no-store');
  for (const rpc of [async () => { throw Error('network'); }, async () => ({ ...receipt(), decision: { ...decision(), account: 'erased' } })])
    assert.equal((await (await handleProfileData(request(bytes), options(rpc))).json()).error.code, 'PROFILE_ACK_UNKNOWN');
  const recovered = await handleProfileData(request(recover()), options(async (action, raw) => { assert.equal(action, 'recover'); assert.equal(JSON.parse(raw).mutationBytes, bytes); return receipt(); }));
  assert.equal(recovered.status, 200);
  const pending = await handleProfileData(request(recover()), options(async () => unknown()));
  assert.equal((await pending.json()).data.kind, 'unknown');
  const mismatched = await handleProfileData(request(recover()), options(async () => ({ ...receipt(), sourceDigest: 'c'.repeat(64) })));
  assert.equal((await mismatched.json()).error.code, 'PROFILE_ACK_UNKNOWN');
});

test('authority checks surround dispatch; malformed transport and replaced owner cannot reveal profile', async () => {
  let calls = 0;
  const rpc = async () => { calls++; return preview(); };
  for (const authority of [{ authenticate: async () => null, current: async () => true, rpc }, { authenticate: async () => actor, current: async () => false, rpc }])
    assert.equal((await handleProfileData(request(command), { enabled: true, authority: () => authority })).status, 401);
  for (const header of ['cookie', 'origin']) { const req = request(command); req.headers.set(header, 'untrusted'); assert.equal((await handleProfileData(req, options(rpc))).status, 400); }
  assert.equal(calls, 0);
  let current = true;
  const changed = { enabled: true, now: () => now + 1, authority: () => ({ authenticate: async () => actor, current: async () => current,
    rpc: async () => { current = false; return receipt(); } }) };
  assert.equal((await (await handleProfileData(request(bytes), changed)).json()).error.code, 'PROFILE_ACK_UNKNOWN');
});

test('coverage candidate delegates only Profile all-fields or finite progress, retains core export and original recovery bytes', () => {
  const input = { actorId: actor.ownerId, sessionId: actor.sessionId, mobileEpoch: actor.mobileEpoch, moduleId: 'profile', moduleVersion: 'profile-data/1',
    operationId: selection.requestId, action: 'delete', phase: 'execute', tripId: null, commandBytes: bytes };
  assert.ok(validProfileCoverageSelection(input, command));
  assert.deepEqual(profileCoverageOutcome({ input, command, handler: 'profile_data' }, receipt(), now + 20),
    { state: 'scoped_complete', reason: 'SELECTED_PROFILE_CLEAR_WITH_DECLARED_RETENTION' });
  for (const change of [{ moduleId: 'memory' }, { moduleId: 'results' }, { action: 'export' }, { tripId: id(90) }]) assert.equal(validProfileCoverageSelection({ ...input, ...change }, command), false);
  const recovery = { ...input, phase: 'recover' };
  assert.equal(JSON.parse(profileCoverageRequestBody(recovery)).mutationBytes, bytes);
  assert.deepEqual(profileCoverageOutcome({ input: recovery, command, handler: 'profile_data' }, unknown(), now + 20), { state: 'unknown', reason: 'PROFILE_ACK_UNKNOWN' });
});

test('new edit CAS parameters retain original fields; saved-mask defaults are never newly saved preferences', async () => {
  const { profileSaveParameters, validProfileSaveBinding } = await import('../../../../lib/server/privacy/profile-data/writer.ts');
  const { profileHasSavedField } = await import('../../../../lib/server/privacy/profile-data/saved-fields.ts');
  const input = { displayName: 'New explicit edit', travelPace: 'balanced', locale: 'en', currency: 'USD', distanceUnit: 'mile', temperatureUnit: 'celsius', defaultDepartureTime: '09:00' };
  assert.deepEqual(profileSaveParameters(input, 5), { p_display_name: input.displayName, p_travel_pace: 'balanced', p_locale: 'en', p_currency: 'USD',
    p_distance_unit: 'mile', p_temperature_unit: 'celsius', p_default_departure_time: '09:00', p_expected_profile_revision: 5 });
  for (const value of [-1, 0.5, '5', Number.MAX_SAFE_INTEGER]) assert.throws(() => profileSaveParameters(input, value));
  assert.ok(validProfileSaveBinding({ expectedProfileRevision: 5 }));assert.equal(validProfileSaveBinding({ expectedProfileRevision: 5, noticeVersion: 'new-consent' }), false);
  for (const field of ['travel_pace', 'currency', 'default_departure_time']) assert.equal(profileHasSavedField({ savedFields: [] }, field), false);
  assert.equal(profileHasSavedField({ savedFields: ['travel_pace'] }, 'travel_pace'), true);
  assert.equal(profileHasSavedField({ savedFields: ['travel_pace'] }, 'currency'), false);
  assert.equal(profileHasSavedField({}, 'currency'), true); // Historical consumer compatibility before the upgraded schema.
});
