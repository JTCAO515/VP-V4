import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeFixture, subject, sessionId } from '../../contract/identity/native-fixture.ts';
import { translationPrompt } from '../../../lib/server/media-translation/text/contract.ts';
import { translationInputHash } from '../../../lib/server/media-translation/text/recovery-contract.ts';
import { translationRecoveryHTTP, TRANSLATION_RECOVERY_UPSTREAM_MAX_BYTES } from '../../../lib/server/media-translation/text/recovery-http.ts';
const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const identity = { turnId: id(1), threadId: id(2), idempotencyKey: id(3), policyId: id(4), noticeHash: 'a'.repeat(64), sourceLocale: 'en', targetLocale: 'zh', inputHash: translationInputHash('CNY 50.') };
const base = { turnId: id(1), threadId: id(2), input: translationPrompt({ sourceLocale: 'en', targetLocale: 'zh', text: 'CNY 50.' }), locale: 'zh', status: 'accepted', outcome: null, output: null, createdAt: '2026-10-15T00:00:00Z' };
type Options = { stage?: string; change?: (value: unknown, count: number) => unknown; status?: number; abort?: AbortController; oversized?: boolean };
async function setup(t: Parameters<typeof nativeFixture>[0], options: Options = {}) {
 const f = await nativeFixture(t, 'http://127.0.0.1:58261'), transport = globalThis.fetch;
 const patch = { NEXT_PUBLIC_SUPABASE_URL: f.config.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: f.config.publishableKey, VISEPANDA_NATIVE_LOCAL_TEXT: 'true', VISEPANDA_NATIVE_LOCAL_TEXT_POLICY: identity.policyId };
 const prior = new Map(Object.keys(patch).map(key => [key, process.env[key]])); Object.assign(process.env, patch);
 t.after(() => { for (const [key, value] of prior) value === undefined ? delete process.env[key] : process.env[key] = value; });
 const calls: string[] = [], counts = new Map<string, number>(); let stored: Record<string, unknown> = { ...base };
 t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
  const req = new Request(input, init), url = new URL(req.url), stage = url.pathname.split('/').at(-1)!;
  if (url.pathname.startsWith('/auth/')) return transport(input, init);
  assert.equal(url.origin, f.config.url); assert.equal(req.headers.get('authorization'), 'Bearer ' + f.token); assert.equal(req.headers.get('apikey'), f.config.publishableKey);
  assert.equal(init?.redirect, 'error'); calls.push(stage);
  const count = (counts.get(stage) ?? 0) + 1; counts.set(stage, count);
  let value: unknown;
  if (url.pathname.includes('/rpc/')) {
   assert.equal(req.method, 'POST'); const body = await req.json();
   if (stage === 'native_session_v2') { assert.deepEqual(body, { p_action: 'session' }); value = { version: 2, subject, sessionId }; }
   else if (stage === 'read_text_policy') { assert.deepEqual(body, { p_policy_id: identity.policyId }); value = { kind: 'policy', policy: { id: identity.policyId, noticeHash: identity.noticeHash, consentState: 'accepted' } }; }
   else if (stage === 'list_text_turns') { assert.deepEqual(body, { p_policy_id: identity.policyId, p_limit: 20 }); value = { kind: 'history', turns: [stored] }; }
   else if (stage === 'read_text_turn') { assert.deepEqual(body, { p_turn_id: identity.turnId }); const { threadId: _thread, createdAt: _created, status: _status, ...text } = stored; value = { kind: 'text', schemaVersion: 'text-turn-v1', ...text }; }
   else throw Error('Unexpected RPC ' + stage);
  } else {
   assert.equal(req.method, 'GET'); assert.equal(url.searchParams.get('owner_id'), 'eq.' + subject); assert.equal(url.searchParams.get('limit'), '2');
   if (stage === 'chat_threads') value = [{ id: identity.threadId, owner_id: subject, status: 'active' }];
   else if (stage === 'turns') { assert.equal(url.searchParams.get('id'), 'eq.' + identity.turnId); assert.equal(url.searchParams.get('thread_id'), 'eq.' + identity.threadId); value = [{ id: identity.turnId, owner_id: subject, thread_id: identity.threadId, status: stored.status }]; }
   else if (stage === 'chat_turn_idempotency') { assert.equal(url.searchParams.get('thread_id'), 'eq.' + identity.threadId); assert.equal(url.searchParams.get('turn_id'), 'eq.' + identity.turnId); assert.equal(url.searchParams.get('idempotency_key'), 'eq.' + identity.idempotencyKey); value = [{ owner_id: subject, thread_id: identity.threadId, turn_id: identity.turnId, idempotency_key: identity.idempotencyKey }]; }
   else throw Error('Unexpected table ' + stage);
  }
  if (stage === options.stage) {
   if (options.abort) options.abort.abort();
   if (options.oversized) return new Response('x'.repeat(TRANSLATION_RECOVERY_UPSTREAM_MAX_BYTES + 1));
   if (options.status) return Response.json({ message: options.status === 403 ? 'FORBIDDEN' : 'outage' }, { status: options.status });
   if (options.change) value = options.change(value, count);
  }
  return Response.json(value);
 });
 const request = (patch: Record<string, string> = {}, init: RequestInit = {}) => new Request('http://127.0.0.1/api/translate/recovery/' + identity.turnId + '?' + new URLSearchParams({ ...Object.fromEntries(Object.entries(identity).filter(([key]) => key !== 'turnId')), ...patch }), { ...init, headers: { Authorization: 'Bearer ' + f.token, ...init.headers } });
 return { calls, request, setStored: (value: Record<string, unknown>) => { stored = value; } };
}
test('actual SDK synthetic transport reads original pending then translated/failure/cancelled; only allowlisted reads', async t => {
 const f = await setup(t);
 for (const [status, state, output, outcome] of [['accepted', 'pending', null, null], ['completed', 'translated', JSON.stringify({ translation: '50元', backTranslation: 'CNY 50.' }), 'answered'], ['failed', 'unavailable', null, null], ['cancelled', 'cancelled', null, null]] as const) {
  f.setStored({ ...base, status, output, outcome }); const result = await translationRecoveryHTTP(f.request(), identity.turnId);
  assert.equal(result.status, 200); const value = await result.json(); assert.equal(value.state, state); assert.deepEqual(value.identity, identity); assert.equal(result.headers.get('cache-control'), 'private, no-store');
 }
 assert.deepEqual([...new Set(f.calls)].sort(), ['chat_threads', 'chat_turn_idempotency', 'list_text_turns', 'native_session_v2', 'read_text_policy', 'read_text_turn', 'turns'].sort());
});
for (const stage of ['chat_threads', 'turns', 'chat_turn_idempotency', 'list_text_turns', 'read_text_turn']) test('missing/removed ' + stage + ' is unknown with null phrase and no private text', async t => {
 const f = await setup(t, { stage, change: () => stage === 'list_text_turns' ? { kind: 'history', turns: [] } : stage === 'read_text_turn' ? { kind: 'unavailable' } : [] });
 const response = await translationRecoveryHTTP(f.request(), identity.turnId); assert.equal(response.status, 200);
 const value = await response.json(); assert.equal(value.state, 'unknown'); assert.equal(value.phrase, null); assert.ok(!JSON.stringify(value).includes('CNY'));
});
for (const [stage, field, value] of [['chat_threads', 'status', 'archived'], ['turns', 'owner_id', id(9)], ['turns', 'thread_id', id(9)], ['chat_turn_idempotency', 'turn_id', id(9)], ['chat_turn_idempotency', 'idempotency_key', id(9)]] as const) test('wrong ' + stage + '.' + field + ' cannot publish', async t => {
 const f = await setup(t, { stage, change: data => (data as Record<string, unknown>[]).map(row => ({ ...row, [field]: value })) });
 const response = await translationRecoveryHTTP(f.request(), identity.turnId); assert.equal(response.status, 200); assert.equal((await response.json()).state, 'unknown');
});
for (const patch of ([{ inputHash: 'b'.repeat(64) }, { sourceLocale: 'zh', targetLocale: 'en' }] as Record<string, string>[])) test('content identity mismatch keeps original attempt unknown', async t => {
 const f = await setup(t); const response = await translationRecoveryHTTP(f.request(patch), identity.turnId); assert.equal(response.status, 200); assert.equal((await response.json()).state, 'unknown');
});
for (const [field, value] of [['id', id(9)], ['noticeHash', 'b'.repeat(64)], ['consentState', 'withdrawn']]) test('current policy ' + field + ' denial is 403, never unknown', async t => {
 const f = await setup(t, { stage: 'read_text_policy', change: data => ({ ...data as object, policy: { ...(data as { policy: object }).policy, [field]: value } }) });
 const response = await translationRecoveryHTTP(f.request(), identity.turnId); assert.equal(response.status, 403); assert.equal((await response.json()).error.code, 'DATA_POLICY_BLOCKED');
});
test('wrong current policy/notice query and session replacement keep original error semantics', async t => {
 const f = await setup(t, { stage: 'native_session_v2', change: data => ({ ...data as object, sessionId: id(9) }) });
 assert.equal((await translationRecoveryHTTP(f.request({ policyId: id(9) }), identity.turnId)).status, 403);
 assert.equal((await translationRecoveryHTTP(f.request(), identity.turnId)).status, 401);
});
for (const stage of ['read_text_turn', 'chat_turn_idempotency', 'list_text_turns']) test('malformed/unknown ' + stage + ' schema is unavailable, without private content', async t => {
 const f = await setup(t, { stage, change: data => Array.isArray(data) ? [...data, ...data, ...data] : { ...data as object, extra: 'secret' } });
 const response = await translationRecoveryHTTP(f.request(), identity.turnId); assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: { code: 'PROVIDER_UNAVAILABLE' } });
});
for (const status of [403, 503]) test('transport/permission error ' + status + ' does not become unknown', async t => {
 const f = await setup(t, { stage: 'chat_threads', status }); assert.equal((await translationRecoveryHTTP(f.request(), identity.turnId)).status, status);
});
test('bounded upstream response fails closed', async t => {
 const f = await setup(t, { stage: 'list_text_turns', oversized: true }); assert.equal((await translationRecoveryHTTP(f.request(), identity.turnId)).status, 503);
});
for (const stage of ['read_text_policy', 'native_session_v2', 'chat_threads', 'read_text_turn']) test('revalidation detects revocation/account/deletion/content race at ' + stage, async t => {
 const f = await setup(t, { stage, change: (data, count) => {
  if (count === 1) return data;
  if (stage === 'read_text_policy') return { kind: 'policy', policy: { id: identity.policyId, noticeHash: identity.noticeHash, consentState: 'withdrawn' } };
  if (stage === 'native_session_v2') return { subject: id(9), sessionId };
  if (stage === 'chat_threads') return [];
  return { ...data as object, input: 'private changed input' };
 } });
 const response = await translationRecoveryHTTP(f.request(), identity.turnId);
 assert.equal(response.status, stage === 'read_text_policy' ? 403 : stage === 'native_session_v2' ? 401 : 200);
 if (response.ok) { const value = await response.json(); assert.equal(value.state, 'unknown'); assert.equal(value.phrase, null); }
});
test('abort and late callback cannot continue reads or publish', async t => {
 const controller = new AbortController(); const f = await setup(t, { stage: 'read_text_turn', abort: controller });
 const response = await translationRecoveryHTTP(f.request({}, { signal: controller.signal }), identity.turnId); assert.equal(response.status, 503);
 assert.equal(f.calls.at(-1), 'read_text_turn');
});
test('closed GET-only query, no ambient credentials and production refusal', async t => {
 const f = await setup(t);
 for (const init of ([{ method: 'POST' }, { headers: { cookie: '' } }, { headers: { origin: 'http://127.0.0.1' } }] as RequestInit[])) assert.equal((await translationRecoveryHTTP(f.request({}, init), identity.turnId)).status, 400);
 const request = f.request(); assert.equal((await translationRecoveryHTTP(new Request(request.url + '&unknown=x', request), identity.turnId)).status, 400);
 assert.equal((await translationRecoveryHTTP(new Request(request.url + '&threadId=' + identity.threadId, request), identity.turnId)).status, 400);
 assert.equal((await translationRecoveryHTTP(f.request({ noticeHash: 'a'.repeat(2001) }), identity.turnId)).status, 400);
 const prior = process.env.VERCEL_ENV; process.env.VERCEL_ENV = 'production';
 try { assert.equal((await translationRecoveryHTTP(f.request(), identity.turnId)).status, 503); } finally { if (prior === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = prior; }
 assert.equal(f.calls.length, 0);
});
test('delayed callback after client abort cannot issue a successor read or publish stale data', async t => {
 const f = await setup(t), transport = globalThis.fetch, controller = new AbortController();
 let arrived!: () => void, release!: () => void;
 const seen = new Promise<void>(resolve => { arrived = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
 t.after(() => { controller.abort(); release(); });
 t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
  const response = await transport(input, init);
  if (new URL(new Request(input, init).url).pathname.endsWith('/read_text_turn')) { arrived(); await held; }
  return response;
 });
 const pending = translationRecoveryHTTP(f.request({}, { signal: controller.signal }), identity.turnId);
 await Promise.race([seen, pending.then(() => { throw Error('returned before controlled callback'); })]);
 controller.abort(); assert.equal((await pending).status, 503); const count = f.calls.length;
 release(); await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve));
 assert.equal(f.calls.length, count); assert.equal(f.calls.at(-1), 'read_text_turn');
});
