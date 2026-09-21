import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server.js';
import { translationHTTP } from '../../../lib/server/media-translation/text/http.ts';
import { readTranslationInput, translationPrompt } from '../../../lib/server/media-translation/text/contract.ts';
const id = '11111111-1111-4111-8111-111111111111';
const input = { threadId: id, turnId: id, policyId: id, idempotencyKey: id, sourceLocale: 'en' as const, targetLocale: 'zh' as const, text: 'Not the airport. CNY 50.' };
const post = (body: unknown, headers: Record<string, string> = {}) => new NextRequest('http://127.0.0.1/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer synthetic', ...headers }, body: JSON.stringify(body) });
test('translation uses existing authenticated admission with unchanged idempotency and no history', async () => {
 let calls = 0;
 const handler: Parameters<typeof translationHTTP>[1] = async (request, action) => {
  calls++; assert.equal(action, 'submit'); assert.equal(request.headers.get('authorization'), 'Bearer synthetic');
  const body = await request.json();
  assert.deepEqual(Object.keys(body).sort(), ['threadId', 'turnId', 'idempotencyKey', 'policyId', 'locale', 'text'].sort());
  assert.equal(body.idempotencyKey, id); assert.equal(body.policyId, id); assert.equal(body.locale, 'zh');
  assert.deepEqual(readTranslationInput(body.text), { sourceLocale: 'en', targetLocale: 'zh', text: input.text });
  return Response.json({ version: 1, kind: 'accepted', turnId: id, reused: calls > 1 }, { status: calls > 1 ? 200 : 201 });
 };
 assert.equal((await translationHTTP(post(input), handler)).status, 201);
 assert.equal((await translationHTTP(post(input), handler)).status, 200);
});
test('rejects extra context, malformed/oversized bodies, ambient authority before admission', async () => {
 let calls = 0;
 const handler: Parameters<typeof translationHTTP>[1] = async () => { calls++; throw Error('must not run'); };
 for (const request of [post({ ...input, tripId: id }), post(input, { Origin: 'http://127.0.0.1' }), post(input, { Cookie: '' }), post({ ...input, text: 'x'.repeat(13000) }), new NextRequest('http://127.0.0.1/api/translate?owner=other'), new NextRequest('http://127.0.0.1/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })]) {
  assert.equal((await translationHTTP(request, handler)).status, 400);
 }
 assert.equal(calls, 0);
});
test('consent/session/budget errors propagate unchanged without a direct provider path', async () => {
 for (const [code, status] of [['DATA_POLICY_BLOCKED', 403], ['UNAUTHENTICATED', 401], ['BUDGET_EXCEEDED', 429]] as const) {
  const result = await translationHTTP(post(input), async () => Response.json({ error: { code } }, { status }));
  assert.equal(result.status, status); assert.deepEqual(await result.json(), { error: { code } });
 }
});
test('read-only history filters unrelated private Ask turns and never regenerates', async () => {
 const result = await translationHTTP(new NextRequest('http://127.0.0.1/api/translate'), async (_, action) => {
  assert.equal(action, 'history');
  return Response.json({ kind: 'history', turns: [
   { turnId: id, locale: 'zh', input: 'private unrelated message', status: 'completed', output: 'private answer', outcome: 'answered' },
   { turnId: id, locale: 'zh', input: translationPrompt(input), status: 'completed', output: JSON.stringify({ translation: '不是机场。50 元。', backTranslation: input.text }), outcome: 'answered' },
  ] });
 });
 assert.equal(result.headers.get('cache-control'), 'private, no-store');
 const body = await result.json(); assert.equal(body.phrases.length, 1); assert.equal(body.phrases[0].original, input.text);
 assert.equal(JSON.stringify(body).includes('private unrelated'), false);
});
