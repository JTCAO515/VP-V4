// Explicitly gated owned PostgreSQL17; actual migration chain and authenticated SQL.
// SDK transport/JWT signing is synthetic, not managed Auth or PostgREST acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ownedPg } from '../ios004-user-address/owned-pg.mjs';
import { nativeFixture, subject, sessionId } from '../../contract/identity/native-fixture.ts';
import { translationRecoveryHTTP } from '../../../lib/server/media-translation/text/recovery-http.ts';
import { translationInputHash } from '../../../lib/server/media-translation/text/recovery-contract.ts';
import { translationPrompt } from '../../../lib/server/media-translation/text/contract.ts';

test('IOS005 owned PG17 full migration chain: ordinary RLS + exact protected readers recover only the same original submit', { skip: process.env.IOS005_NATIVE_PG !== '1', timeout: 180000 }, async t => {
 const pg = await ownedPg({ bin: process.env.IOS005_PG_BIN, module: process.env.IOS005_PG_MODULE }), c = pg.client;
 t.after(() => pg.cleanup());
 await c.query(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql', 'utf8'));
 await c.query("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;grant usage on schema auth to authenticated,anon,service_role;");
 const migrations = readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort();
 for (const file of migrations) {
  try { await c.query('begin'); await c.query(readFileSync('supabase/migrations/' + file, 'utf8')); await c.query('commit'); }
  catch (e) { await c.query('rollback'); throw Error(file + ': ' + e.message); }
 }
 console.log('PASS chronological current migrations', migrations.length, 'PG', (await c.query('show server_version')).rows[0].server_version);
 const owner = subject, session = sessionId, other = randomUUID(), otherSession = randomUUID();
 await c.query('insert into auth.users(id) values($1),($2);', [owner, other]);
 await c.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)', [session, owner, otherSession, other]);
 await c.query('insert into identity_private.mobile_accounts(owner_id,epoch,session_id) values($1,1,$2),($3,1,$4)', [owner, session, other, otherSession]);
 const policyId = randomUUID(), foreignPolicy = randomUUID(), noticeHash = 'a'.repeat(64);
 for (const policy of [policyId, foreignPolicy]) await c.query(`insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at,context_mode) values($1,'qwen','synthetic-only','https://synthetic.invalid/inference','fixture','fixture','fixture','test','test',$2,'测试告知','Test notice','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 day',now()+interval '1 day','current_input_v1')`, [policy, noticeHash]);
 const asActor = async (user, sid, work) => {
  await c.query("select set_config('request.jwt.claim.role','authenticated',false),set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [user, JSON.stringify({ role: 'authenticated', is_anonymous: false, session_id: sid })]);
  await c.query('set role authenticated'); try { return await work(); } finally { await c.query('reset role'); }
 };
 const call = (name, args) => asActor(owner, session, async () => (await c.query('select public.' + name + '(' + args.map((_, i) => '$' + (i + 1)).join(',') + ') value', args)).rows[0].value);
 for (const policy of [policyId, foreignPolicy]) assert.equal((await call('accept_text_policy', [policy, noticeHash])).kind, 'accepted');
 await asActor(other, otherSession, () => c.query('select public.accept_text_policy($1,$2)', [policyId, noticeHash]));
 const identity = { turnId: randomUUID(), threadId: randomUUID(), idempotencyKey: randomUUID(), policyId, noticeHash, sourceLocale: 'en', targetLocale: 'zh', inputHash: translationInputHash('CNY 50.') };
 const prompt = translationPrompt({ sourceLocale: 'en', targetLocale: 'zh', text: 'CNY 50.' });
 const submit = (i = identity) => call('submit_text_turn', [i.threadId, i.turnId, i.idempotencyKey, i.policyId, 'zh', prompt]);
 assert.equal((await submit()).turnId, identity.turnId);
 const f = await nativeFixture(t, 'http://127.0.0.1:58262'), originalFetch = globalThis.fetch;
 const otherToken = await f.sign({ sub: other, session_id: otherSession });
 const patch = { NEXT_PUBLIC_SUPABASE_URL: f.config.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: f.config.publishableKey, VISEPANDA_NATIVE_LOCAL_TEXT: 'true', VISEPANDA_NATIVE_LOCAL_TEXT_POLICY: policyId };
 const prior = new Map(Object.keys(patch).map(key => [key, process.env[key]])); Object.assign(process.env, patch);
 t.after(() => { for (const [key, value] of prior) value === undefined ? delete process.env[key] : process.env[key] = value; });
 const rpcNames = new Map([['native_session_v2', ['p_action']], ['read_text_policy', ['p_policy_id']], ['list_text_turns', ['p_policy_id', 'p_limit']], ['read_text_turn', ['p_turn_id']]]);
 const tableColumns = new Map([['chat_threads', ['id', 'owner_id', 'status']], ['turns', ['id', 'owner_id', 'thread_id', 'status']], ['chat_turn_idempotency', ['owner_id', 'thread_id', 'turn_id', 'idempotency_key']]]);
 const paths = [];
 t.mock.method(globalThis, 'fetch', async (input, init) => {
  const request = new Request(input, init), url = new URL(request.url), name = url.pathname.split('/').at(-1);
  if (url.pathname.startsWith('/auth/')) return originalFetch(input, init);
  assert.equal(url.origin, f.config.url); const isOther = request.headers.get('authorization') === 'Bearer ' + otherToken;
  assert.ok(isOther || request.headers.get('authorization') === 'Bearer ' + f.token); paths.push(name);
  try {
   return await asActor(isOther ? other : owner, isOther ? otherSession : session, async () => {
    let data;
    if (url.pathname.includes('/rpc/')) {
     const keys = rpcNames.get(name); assert.ok(keys, 'no write/admission/worker/cost RPC'); const body = await request.json(); assert.deepEqual(Object.keys(body).sort(), [...keys].sort());
     data = (await c.query('select public.' + name + '(' + keys.map((_, i) => '$' + (i + 1)).join(',') + ') value', keys.map(k => body[k]))).rows[0].value;
    } else {
     assert.equal(request.method, 'GET'); const columns = tableColumns.get(name); assert.ok(columns); assert.equal(url.searchParams.get('select'), columns.join(','));
     const filters = [...url.searchParams].filter(([key]) => key !== 'select' && key !== 'limit');
     assert.ok(filters.every(([key, value]) => columns.includes(key) && value.startsWith('eq.')));
     data = (await c.query('select ' + columns.join(',') + ' from public.' + name + ' where ' + filters.map(([key], i) => key + '=$' + (i + 1)).join(' and ') + ' limit 2', filters.map(([, value]) => value.slice(3)))).rows;
    }
    return Response.json(data);
   });
  } catch (error) { return Response.json({ code: error.code ?? 'XX000', message: error.message }, { status: 403 }); }
 });
 const read = async (overrides = {}, token = f.token) => {
  const i = { ...identity, ...overrides }, params = new URLSearchParams(Object.entries(i).filter(([key]) => key !== 'turnId'));
  const response = await translationRecoveryHTTP(new Request(f.config.url + '/api/translate/recovery/' + i.turnId + '?' + params, { headers: { Authorization: 'Bearer ' + token } }), i.turnId);
  return { status: response.status, body: await response.json() };
 };
 const expect = async (state, overrides) => { const result = await read(overrides); assert.equal(result.status, 200, JSON.stringify(result)); assert.equal(result.body.state, state); if (state === 'unknown') assert.equal(result.body.phrase, null); return result.body; };
 const counts = async () => (await c.query("select (select count(*) from public.turns) turns,(select count(*) from public.chat_turn_idempotency) keys,(select count(*) from turn_private.work) work,(select count(*) from turn_private.text_dispatches) dispatches")).rows[0];
 const before = await counts();
 const otherRead = await read({}, otherToken); assert.equal(otherRead.status, 200); assert.equal(otherRead.body.state, 'unknown'); assert.equal(otherRead.body.phrase, null);
 await expect('pending'); await expect('pending'); assert.deepEqual(await counts(), before);
 // Actual database fixture states; no provider/model is invoked or claimed.
 await c.query("update public.turns set status='completed' where id=$1", [identity.turnId]);
 await c.query("update turn_private.text_content set output_kind='answered',output_text=$2 where turn_id=$1", [identity.turnId, JSON.stringify({ translation: '50元', backTranslation: 'CNY 50.' })]);
 await expect('translated');
 for (const overrides of [{ threadId: randomUUID() }, { turnId: randomUUID() }, { idempotencyKey: randomUUID() }, { inputHash: 'f'.repeat(64) }, { sourceLocale: 'zh', targetLocale: 'en' }]) await expect('unknown', overrides);
 // A second current/accepted policy with same notice cannot claim the original Turn.
 process.env.VISEPANDA_NATIVE_LOCAL_TEXT_POLICY = foreignPolicy; await expect('unknown', { policyId: foreignPolicy }); process.env.VISEPANDA_NATIVE_LOCAL_TEXT_POLICY = policyId;
 const visible = await asActor(other, otherSession, async () => ({
  turns: (await c.query('select id from public.turns where id=$1', [identity.turnId])).rows,
  threads: (await c.query('select id from public.chat_threads where id=$1', [identity.threadId])).rows,
  keys: (await c.query('select turn_id from public.chat_turn_idempotency where turn_id=$1', [identity.turnId])).rows,
  text: (await c.query('select public.read_text_turn($1) value', [identity.turnId])).rows[0].value,
 })); assert.deepEqual(visible, { turns: [], threads: [], keys: [], text: { kind: 'unavailable' } });
 await c.query("update public.chat_threads set status='archived' where id=$1", [identity.threadId]); await expect('unknown'); await c.query("update public.chat_threads set status='active' where id=$1", [identity.threadId]);
 await c.query('update turn_private.text_content set hidden_at=now() where turn_id=$1', [identity.turnId]); await expect('unknown'); await c.query('update turn_private.text_content set hidden_at=null where turn_id=$1', [identity.turnId]);
 await c.query("update public.turns set status='failed' where id=$1", [identity.turnId]); await c.query("update turn_private.text_content set output_kind='technical_failure',output_text='Fixture failure' where turn_id=$1", [identity.turnId]); await expect('unavailable');
 const cancel = { ...identity, turnId: randomUUID(), idempotencyKey: randomUUID() }; await submit(cancel); await call('cancel_chat_turn', [cancel.turnId]); await expect('cancelled', { turnId: cancel.turnId, idempotencyKey: cancel.idempotencyKey });
 await c.query("update turn_private.text_content set output_kind='answered',output_text=$2 where turn_id=$1", [cancel.turnId, JSON.stringify({ translation: '50元', backTranslation: 'CNY 50.' })]); await expect('unknown', { turnId: cancel.turnId, idempotencyKey: cancel.idempotencyKey });
 // Twenty-one newer same-policy Turns evict the original only from the reader window.
 for (let n = 0; n < 21; n++) await submit({ ...identity, turnId: randomUUID(), idempotencyKey: randomUUID() });
 await expect('unknown'); assert.equal((await c.query('select count(*) n from public.turns where id=$1', [identity.turnId])).rows[0].n, '1');
 await c.query('delete from public.turns where id=$1', [identity.turnId]); await expect('unknown');
 await call('withdraw_text_policy', [policyId]); assert.equal((await read()).status, 403);
 await c.query('delete from auth.sessions where id=$1', [session]); assert.equal((await read()).status, 401);
 console.log('PASS owner-scoped ordinary authenticated RLS, current policy/notice/consent, exact key/text/hash/locale, archived/hidden, state mapping, late output, recent20 unknown; zero generation/admission/worker RPC in recovery', [...new Set(paths)]);
});
