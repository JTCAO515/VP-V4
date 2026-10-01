import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as uuid } from 'node:crypto';
import { createNativeTextEnvironment } from '../turn/native-text-environment.mjs';
import { identityLocalEnv } from '../identity/local-supabase.mjs';
import { translationHistoryHTTP } from '../../../lib/server/media-translation/text/history-http.ts';

test('real disposable Auth/HTTP saved translation pages reopen beyond legacy20 with no model calls', {
 skip: process.env.VP_NATIVE_TEXT_INTEGRATION !== 'true', timeout: 180000,
}, async t => {
 const e = await createNativeTextEnvironment(); t.after(() => e.cleanup());
 const call = async (path, token, method = 'GET', body) => {
  const response = await fetch(e.api + path, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') };
 };
 const login = async user => {
  const attemptId = uuid(), credential = await call('/api/auth/native/v2/credentials', null, 'POST', { email: user.email, password: user.password, attemptId });
  assert.equal(credential.status, 200);
  assert.equal((await call('/api/auth/native/v2/login', credential.body.accessToken, 'POST', { attemptId })).status, 200);
  return credential.body.accessToken;
 };
 const owner = await login(e.users[0]), other = await login(e.users[1]);
 for (const token of [owner, other]) assert.equal((await call('/api/translate/consent', token, 'POST', { policyId: e.policyId, noticeHash: e.noticeHash })).status, 200);
 const base = '/api/translate/history/v2';
 assert.equal((await call(base)).status, 401);
 const seed = async (token = owner, ordinary = false) => {
  const turnId = uuid(), threadId = uuid(), idempotencyKey = uuid();
  const data = ordinary ? { turnId, threadId, idempotencyKey, policyId: e.policyId, locale: 'en', text: 'PRIVATE ORDINARY TITLE' }
   : { turnId, threadId, idempotencyKey, policyId: e.policyId, sourceLocale: 'en', targetLocale: 'zh', text: 'Synthetic CNY 50.' };
  assert.equal((await call(ordinary ? '/api/chat/native/v1/turns' : '/api/translate', token, 'POST', data)).status, 201);
  e.sql(`update public.turns set status='completed' where id='${turnId}'; update turn_private.text_content set output_kind='answered',output_text='{"translation":"合成50元。","backTranslation":"Synthetic CNY 50."}' where turn_id='${turnId}';`);
  return turnId;
 };
 const old = await seed(), foreign = await seed(other);
 for (let i = 0; i < 21; i++) await seed(owner, true);
 assert.ok(!(await call('/api/translate', owner)).body.phrases.some(p => p.turnId === old));
 const exact = await call(base + '/turns/' + old, owner);
 assert.equal(exact.status, 200); assert.equal(exact.body.phrase.turnId, old); assert.equal(exact.cache, 'private, no-store');
 for (let i = 0; i < 25; i++) await seed();
 const first = await call(base, owner); assert.equal(first.body.kind, 'translations'); assert.equal(first.body.phrases.length, 20); assert.ok(first.body.nextCursor);
 const second = await call(base + '?cursor=' + first.body.nextCursor, owner);
 assert.equal(second.body.phrases.length, 6); assert.equal(second.body.nextCursor, null); assert.ok(second.body.phrases.some(p => p.turnId === old));
 assert.ok(!JSON.stringify(first.body).includes('PRIVATE ORDINARY')); assert.ok(!JSON.stringify(first.body).includes(foreign));
 assert.equal((await call(base + '/turns/' + old, other)).body.kind, 'unavailable');
 assert.equal((await call(base + '?cursor=' + foreign, owner)).body.kind, 'unavailable');
 e.sql(`update public.turns set status='failed' where id='${old}';`);
 assert.equal((await call(base + '/turns/' + old, owner)).body.kind, 'unavailable');
 e.sql(`update turn_private.text_content set hidden_at=clock_timestamp() where turn_id='${first.body.nextCursor}';`);
 assert.equal((await call(base + '?cursor=' + first.body.nextCursor, owner)).body.kind, 'unavailable');
 assert.equal((await call('/api/translate/consent', owner, 'DELETE', { policyId: e.policyId })).status, 200);
 assert.equal((await call(base, owner)).body.kind, 'unavailable');
 assert.equal((await call(base + '/turns/' + second.body.phrases[0].turnId, owner)).body.kind, 'unavailable');
 assert.equal(e.counts.http, 0, 'history admission fixtures never dispatch a model');
 assert.equal(e.sql('select count(*) from public.model_budget_attempts;'), '0');

 // Same real disposable JWT/RPC route composition, with a deterministic revocation
 // between source reads. No credential or private payload is logged/persisted.
 const local = identityLocalEnv();
 const patch = { NEXT_PUBLIC_SUPABASE_URL: local.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.ANON_KEY,
  VISEPANDA_NATIVE_LOCAL_TEXT: 'true', VISEPANDA_NATIVE_LOCAL_TEXT_POLICY: e.policyId };
 const prior = Object.fromEntries(Object.keys(patch).map(key => [key, process.env[key]]));
 Object.assign(process.env, patch);
 const originalFetch = globalThis.fetch; let reads = 0;
 globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url ?? String(input);
  if (url.endsWith('/rest/v1/rpc/list_saved_translations_v1') && ++reads === 2) {
   e.sql(`update turn_private.text_consents set revoked_at=clock_timestamp() where owner_id='${e.users[1].id}' and policy_id='${e.policyId}';`);
  }
  return originalFetch(input, init);
 };
 try {
  const response = await translationHistoryHTTP(new Request(e.api + base, { headers: { Authorization: 'Bearer ' + other } }));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { version: 2, kind: 'unavailable' }); assert.equal(reads, 2);
 } finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
 }
 assert.equal(e.counts.http, 0);
});
