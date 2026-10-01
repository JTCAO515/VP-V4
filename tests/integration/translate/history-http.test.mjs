import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as uuid } from 'node:crypto';
import { createNativeTextEnvironment } from '../turn/native-text-environment.mjs';
import { identityLocalEnv } from '../identity/local-supabase.mjs';
import { translationHistoryHTTP, translationSearchCursor } from '../../../lib/server/media-translation/text/history-http.ts';

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
 const seed = async (token = owner, ordinary = false, text = 'Synthetic CNY 50.', output = { translation: '合成50元。', backTranslation: 'Synthetic CNY 50.' }) => {
  const turnId = uuid(), threadId = uuid(), idempotencyKey = uuid();
  const data = ordinary ? { turnId, threadId, idempotencyKey, policyId: e.policyId, locale: 'en', text: 'PRIVATE ORDINARY TITLE' }
   : { turnId, threadId, idempotencyKey, policyId: e.policyId, sourceLocale: 'en', targetLocale: 'zh', text };
  assert.equal((await call(ordinary ? '/api/chat/native/v1/turns' : '/api/translate', token, 'POST', data)).status, 201);
  e.sql(`update public.turns set status='completed' where id='${turnId}'; update turn_private.text_content set output_kind='answered',output_text='${JSON.stringify(output).replaceAll("'", "''")}' where turn_id='${turnId}';`);
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
 const query = 'synthetic', search = await call(base + '?query=' + query, owner);
 assert.equal(search.body.phrases.length, 20); assert.equal(search.body.query, query); assert.ok(search.body.nextCursor.startsWith('q1.'));
 const nextSearch = await call(base + '?query=' + query + '&cursor=' + search.body.nextCursor, owner);
 assert.equal(nextSearch.body.phrases.length, 6); assert.equal(nextSearch.body.nextCursor, null);
 assert.equal((await call(base + '?query=other&cursor=' + search.body.nextCursor, owner)).body.kind, 'unavailable');
 assert.equal((await call(base + '?query=absent&cursor=' + translationSearchCursor(first.body.nextCursor, 'absent'), owner)).body.kind, 'unavailable');
 assert.equal((await call(base + '?query=synthetic&cursor=' + translationSearchCursor(foreign, 'synthetic'), owner)).body.kind, 'unavailable');
 assert.equal((await call(base + '?query=synthetic&cursor=' + first.body.nextCursor, owner)).status, 400);
 assert.equal((await call(base + '?query=' + 'x'.repeat(121), owner)).status, 400);
 assert.equal((await call(base + '?query=a&query=b', owner)).status, 400);
 assert.equal((await call(base + '/turns/' + old + '?query=synthetic', owner)).status, 400);
 const selected = await seed(other, false, 'Only ORIGINAL %_\\', { translation: '独有目标', backTranslation: 'Only BACKFIELD' });
 for (const term of ['original', '独有目标', 'BACKFIELD', '%_\\']) {
  const result = await call(base + '?query=' + encodeURIComponent(term), other);
  assert.equal(result.body.phrases.length, 1); assert.equal(result.body.phrases[0].turnId, selected); assert.equal(result.body.query, term);
 }
 const reopenedSearch = await call(base + '/turns/' + selected, other);
 assert.equal(reopenedSearch.body.phrase.turnId, selected);
 assert.equal((await call(base + '?query=original', owner)).body.phrases.length, 0, 'other actor matching source is never returned');

 assert.equal((await call(base + '/turns/' + old, other)).body.kind, 'unavailable');
 assert.equal((await call(base + '?cursor=' + foreign, owner)).body.kind, 'unavailable');
 e.sql(`update public.turns set status='failed' where id='${old}';`);
 assert.equal((await call(base + '/turns/' + old, owner)).body.kind, 'unavailable');
 e.sql(`update turn_private.text_content set hidden_at=clock_timestamp() where turn_id='${first.body.nextCursor}';`);
 assert.equal((await call(base + '?cursor=' + first.body.nextCursor, owner)).body.kind, 'unavailable');
 assert.equal((await call('/api/translate/consent', owner, 'DELETE', { policyId: e.policyId })).status, 200);
 assert.equal((await call(base, owner)).body.kind, 'unavailable');
 assert.equal((await call(base + '?query=synthetic', owner)).body.kind, 'unavailable');
 assert.equal((await call(base + '?query=synthetic&cursor=' + search.body.nextCursor, owner)).body.kind, 'unavailable');
 assert.equal((await call(base + '/turns/' + second.body.phrases[0].turnId, owner)).body.kind, 'unavailable');
 const largeActor = await login(e.users[2]);
 assert.equal((await call('/api/translate/consent', largeActor, 'POST', { policyId: e.policyId, noticeHash: e.noticeHash })).status, 200);
 const longOutput = JSON.stringify({ translation: '译'.repeat(2400), backTranslation: '回'.repeat(2400) });
 assert.ok(longOutput.length < 8000);
 for (let i = 0; i < 20; i++) {
  const turnId = uuid();
  assert.equal((await call('/api/translate', largeActor, 'POST', { threadId: uuid(), turnId, idempotencyKey: uuid(), policyId: e.policyId,
   sourceLocale: 'zh', targetLocale: 'en', text: '原'.repeat(600) })).status, 201);
  e.sql(`update public.turns set status='completed' where id='${turnId}'; update turn_private.text_content set output_kind='answered',output_text='${longOutput}' where turn_id='${turnId}';`);
 }
 const largeResponse = await fetch(e.api + base, { headers: { Authorization: 'Bearer ' + largeActor } });
 assert.equal(largeResponse.status, 200);
 const largeWire = await largeResponse.text(), largePage = JSON.parse(largeWire);
 assert.equal(largePage.kind, 'translations'); assert.equal(largePage.phrases.length, 20); assert.equal(largePage.nextCursor, null);
 const wireBytes = Buffer.byteLength(largeWire, 'utf8');
 assert.ok(wireBytes > 324_000 && wireBytes < 1_000_000);
 t.diagnostic('actual HTTP legal CJK page bytes=' + wireBytes + ', phrases=20, existing output ceiling<8000 retained');
 assert.equal(e.counts.http, 0, 'history admission fixtures never dispatch a model');
 assert.equal(e.sql('select count(*) from public.model_budget_attempts;'), '0');

 // Same real disposable JWT/RPC route composition, with a deterministic revocation
 // between source reads. No credential or private payload is logged/persisted.
 const local = identityLocalEnv();
 const patch = { NEXT_PUBLIC_SUPABASE_URL: local.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.ANON_KEY,
  VISEPANDA_NATIVE_LOCAL_TEXT: 'true', VISEPANDA_NATIVE_LOCAL_TEXT_POLICY: e.policyId };
 const prior = Object.fromEntries(Object.keys(patch).map(key => [key, process.env[key]]));
 Object.assign(process.env, patch);
 const originalFetch = globalThis.fetch; let reads = 0, faultCases = 0;
 try {
  for (const phase of [1, 2]) {
   for (const mode of ['rpc-transient', 'transport-503', 'network', 'session-replaced', 'subject-mismatch', 'malformed']) {
    for (const turnId of [undefined, foreign]) {
     let sessions = 0, sourceReads = 0;
     globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.url ?? String(input);
      if (/\/rest\/v1\/rpc\/(list_saved_translations_v1|read_saved_translation_v1)$/.test(url)) sourceReads++;
      if (url.endsWith('/rest/v1/rpc/native_session_v2') && ++sessions === phase) {
       if (mode === 'network') throw Error('Synthetic session transport unavailable');
       if (mode === 'rpc-transient') return Response.json({ code: 'P0001', message: 'Synthetic database temporarily unavailable' }, { status: 400 });
       if (mode === 'transport-503') return Response.json({ message: 'Synthetic gateway unavailable' }, { status: 503 });
       if (mode === 'session-replaced') return Response.json({ code: 'P0001', message: 'SESSION_REPLACED' }, { status: 400 });
       if (mode === 'subject-mismatch') return Response.json({ subject: uuid(), sessionId: uuid() });
       return Response.json({});
      }
      return originalFetch(input, init);
     };
     const response = await translationHistoryHTTP(new Request(e.api + base + (turnId ? '/turns/' + turnId : ''), { headers: { Authorization: 'Bearer ' + other } }), turnId);
     const denied = ['session-replaced', 'subject-mismatch'].includes(mode);
     assert.equal(response.status, denied ? 401 : 503, `${mode} phase${phase}`);
     assert.deepEqual(await response.json(), { error: { code: denied ? 'UNAUTHENTICATED' : 'PROVIDER_UNAVAILABLE' } });
     assert.equal(sourceReads, phase === 1 ? 0 : 2, 'failed session returns no source content');
     faultCases++;
    }
   }
  }
  assert.equal(faultCases, 24);
  t.diagnostic('24/24 session fault injections observed: initial/final x page/exact x RPC transient,503,network,replaced,mismatch,malformed');
  globalThis.fetch = originalFetch;
  const recovered = await translationHistoryHTTP(new Request(e.api + base, { headers: { Authorization: 'Bearer ' + other } }));
  assert.equal(recovered.status, 200); assert.equal((await recovered.json()).kind, 'translations', 'transient failure did not revoke or mutate the synthetic session');
 } finally { globalThis.fetch = originalFetch; }
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
