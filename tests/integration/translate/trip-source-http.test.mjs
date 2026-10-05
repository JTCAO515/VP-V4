import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as uuid } from 'node:crypto';
import { createNativeTextEnvironment } from '../turn/native-text-environment.mjs';
import { readTranslationInput } from '../../../lib/server/media-translation/text/contract.ts';

test('disposable Auth/confirmed Trip/selected field/current-input admission/receipt recovery remain owner scoped', {
  skip: process.env.VP_NATIVE_TEXT_INTEGRATION !== 'true', timeout: 180000,
}, async t => {
  // Service workers own only users[0]. The two test actors below have no worker,
  // so no model request or budget attempt can occur in this admission/read proof.
  const e = await createNativeTextEnvironment({ continuous: true }); t.after(() => e.cleanup());
  const call = async (path, token, method = 'GET', body) => {
    const result = await fetch(e.api + path, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: result.status, body: await result.json() };
  };
  const login = async user => {
    const attemptId = uuid(), credential = await call('/api/auth/native/v2/credentials', null, 'POST', { email: user.email, password: user.password, attemptId });
    assert.equal(credential.status, 200);
    assert.equal((await call('/api/auth/native/v2/login', credential.body.accessToken, 'POST', { attemptId })).status, 200);
    return credential.body.accessToken;
  };
  const ownerUser = e.users[2], owner = await login(ownerUser), other = await login(e.users[3]);
  const tripId = uuid(), base = '/api/trips/native/v2/' + tripId, sourcePath = '/api/translate/trip-sources/' + tripId;
  assert.equal((await call('/api/trips/native/v2', owner, 'POST', { tripId, title: 'Synthetic confirmed scene' })).status, 201);
  assert.equal((await call(sourcePath, owner)).status, 409, 'initial Trip has no confirmed source');
  const apply = async (head, title) => {
    const proposal = await call(base + '/proposal', owner, 'POST', { patch: { expectedVersion: head, operations: [
      { kind: 'upsert_day', dayId: 'Day-1', date: '2026-10-05' }, { kind: 'upsert_item', dayId: 'Day-1', itemId: 'item_A', title },
    ] } });
    assert.equal(proposal.status, 201);
    const proof = await call(base + '/proposal?proposalId=' + proposal.body.proposalId, owner);
    assert.equal(proof.status, 200);
    assert.equal((await call(base + '/confirm', owner, 'POST', { proposalId: proposal.body.proposalId, idempotencyKey: uuid(), digest: proof.body.proposal.digest })).status, 200);
  };
  await apply(0, 'Not airport terminal 2');
  assert.equal((await call(sourcePath)).status, 401);
  assert.equal((await call(sourcePath, other)).status, 403);
  const source = await call(sourcePath, owner);
  assert.equal(source.status, 200); assert.equal(source.body.ownerId, ownerUser.id); assert.equal(source.body.headVersion, 1);
  assert.deepEqual(source.body.fields.find(field => field.itemId === 'item_A'), { dayId: 'Day-1', itemId: 'item_A', field: 'title', value: 'Not airport terminal 2' });
  const list = await call('/api/translate/trip-sources', owner);
  assert.equal(list.body.trips[0].tripId, tripId);
  assert.equal((await call('/api/translate/trip-sources', other)).body.trips.length, 0);
  const selected = { ownerId: ownerUser.id, tripId, headVersion: 1, dayId: 'Day-1', itemId: 'item_A', field: 'title' };
  const input = { threadId: uuid(), turnId: uuid(), idempotencyKey: uuid(), policyId: e.policyId, sourceLocale: 'en', targetLocale: 'zh', text: 'Not airport terminal 2', tripSource: selected };
  assert.equal((await call('/api/translate', owner, 'POST', input)).status, 403, 'source access does not grant model consent');
  assert.equal((await call('/api/translate/consent', owner, 'POST', { policyId: e.policyId, noticeHash: e.noticeHash })).status, 200);
  assert.equal((await call('/api/translate', owner, 'POST', { ...input, text: 'Unselected' })).status, 409);
  assert.equal((await call('/api/translate', owner, 'POST', { ...input, tripSource: { ...selected, ownerId: e.users[3].id } })).status, 403);
  const accepted = await call('/api/translate', owner, 'POST', input);
  assert.equal(accepted.status, 201); assert.equal(accepted.body.turnId, input.turnId);
  assert.equal((await call('/api/translate', owner, 'POST', input)).status, 200, 'same exact operation reuses original receipt');
  assert.deepEqual(readTranslationInput(e.sql(`select input_text from turn_private.text_content where turn_id='${input.turnId}';`)), { sourceLocale: 'en', targetLocale: 'zh', text: input.text });
  assert.equal(e.sql(`select count(*) from public.turns where id='${input.turnId}';`), '1');
  await apply(1, 'Changed scene');
  const next = { ...input, threadId: uuid(), turnId: uuid(), idempotencyKey: uuid() };
  assert.equal((await call('/api/translate', owner, 'POST', next)).status, 409, 'old source cannot admit a new translation');
  assert.equal(e.sql(`select count(*) from public.turns where id='${next.turnId}';`), '0');
  const recovered = await call('/api/translate', owner);
  assert.equal(recovered.body.phrases[0].turnId, input.turnId); assert.equal(recovered.body.phrases[0].original, input.text);
  assert.equal((await call('/api/translate', other)).body.phrases?.length ?? 0, 0);
  assert.equal((await call('/api/translate/consent', owner, 'DELETE', { policyId: e.policyId })).status, 200);
  const withdrawn = await call('/api/translate', owner);
  assert.equal(withdrawn.status, 200); assert.deepEqual(withdrawn.body.phrases, [], 'original consent lifecycle hides saved content without expanding authority');
  await login(ownerUser);
  assert.equal((await call(sourcePath, owner)).status, 401, 'replaced native session loses source authority');
  assert.equal(e.counts.http, 0); assert.equal(e.sql('select count(*) from public.model_budget_attempts;'), '0');
  t.diagnostic('actual local Auth/RLS/HTTP/confirmed Trip and frozen input receipt; zero model exchanges and zero budget attempts');
});
