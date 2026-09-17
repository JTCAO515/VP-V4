import test from 'node:test';
import assert from 'node:assert/strict';
import { handleWikiRequest } from '../../../lib/server/knowledge/wiki/http-wiki.ts';

const validPageKey = 'source_summary:synthetic';
const never = () => new Promise(() => {});
const pause = ms => new Promise(r => setTimeout(r, ms));
function request(url, controller = new AbortController()) { return { method: 'GET', url, headers: new Headers(), signal: controller.signal }; }
function options(rpc, extra = {}) { return { enabled: true, milliseconds: 25, createRpc: () => rpc, ...extra }; }
const good = { authenticate: async () => 'reviewer', call: async () => ({ data: { schemaVersion: 'knowledge-wiki/1' }, error: null }) };

test('disabled, bearer header, and missing/malformed pageKey reject before RPC creation', async () => {
  let created = 0;
  const makeOptions = (over) => options(good, { createRpc: () => { created++; return good; }, ...over });
  for (const url of [
    'http://localhost/api/ops/wiki?pageKey=',
    `http://localhost/api/ops/wiki?pageKey=${validPageKey}&extra=1`,
  ]) {
    created = 0;
    const r = await handleWikiRequest(request(url), makeOptions());
    assert.equal(r.status, 400); assert.equal(r.body.error, 'INVALID_INPUT'); assert.equal(created, 0);
  }
  created = 0;
  const disabled = await handleWikiRequest(request(`http://localhost/api/ops/wiki?pageKey=${validPageKey}`), makeOptions({ enabled: false }));
  assert.equal(disabled.status, 503); assert.equal(disabled.body.error, 'OPS_DISABLED'); assert.equal(created, 0);
  created = 0;
  const req = request(`http://localhost/api/ops/wiki?pageKey=${validPageKey}`);
  req.headers.set('authorization', 'Bearer synthetic');
  const bearer = await handleWikiRequest(req, makeOptions());
  assert.equal(bearer.status, 401); assert.equal(bearer.body.error, 'UNAUTHENTICATED'); assert.equal(created, 0);
});

test('failed authentication never dispatches the RPC', async () => {
  let calls = 0;
  const r = await handleWikiRequest(request(`http://localhost/api/ops/wiki?pageKey=${validPageKey}`),
    options({ authenticate: async () => false, call: async () => { calls++; return { data: {}, error: null }; } }));
  assert.equal(r.status, 401); assert.equal(calls, 0);
});

test('successful lookup returns the RPC payload verbatim under data', async () => {
  const r = await handleWikiRequest(request(`http://localhost/api/ops/wiki?pageKey=${validPageKey}`), options(good));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { data: { schemaVersion: 'knowledge-wiki/1' } });
});

test('known RPC errors map to their documented status; unknown errors become OPS_UNAVAILABLE', async () => {
  for (const [message, status] of [['OPS_FORBIDDEN', 403], ['OPS_NOT_FOUND', 404], ['INVALID_INPUT', 400]]) {
    const r = await handleWikiRequest(request(`http://localhost/api/ops/wiki?pageKey=${validPageKey}`),
      options({ ...good, call: async () => ({ data: null, error: { message } }) }));
    assert.equal(r.status, status); assert.equal(r.body.error, message);
  }
  const unknown = await handleWikiRequest(request(`http://localhost/api/ops/wiki?pageKey=${validPageKey}`),
    options({ ...good, call: async () => ({ data: null, error: { message: 'SOMETHING_NEW' } }) }));
  assert.equal(unknown.status, 503); assert.equal(unknown.body.error, 'OPS_UNAVAILABLE');
});

test('a hung authenticate() or RPC call is bounded by the shared lifetime, not left to run forever', async () => {
  const start = Date.now();
  const r = await handleWikiRequest(request(`http://localhost/api/ops/wiki?pageKey=${validPageKey}`),
    options({ authenticate: never, call: async () => { throw new Error('must not be reached'); } }));
  assert.equal(r.status, 503);
  assert.ok(Date.now() - start < 500);
});

test('abort before completion yields OPS_UNAVAILABLE and does not throw', async () => {
  const controller = new AbortController();
  const run = handleWikiRequest(request(`http://localhost/api/ops/wiki?pageKey=${validPageKey}`, controller),
    options({ authenticate: () => pause(200).then(() => 'reviewer'), call: async () => ({ data: {}, error: null }) }, { milliseconds: 5000 }));
  controller.abort();
  const r = await run;
  assert.equal(r.status, 503);
});

test('empty query lists pages, duplicate and unknown query params reject',async()=>{
  const listed=await handleWikiRequest(request('http://localhost/api/ops/wiki'),options({...good,call:async(name,input)=>{assert.equal(name,'ops_wiki_read_v1');assert.deepEqual(input,{p_input:{}});return {data:{pages:[]},error:null};}}));
  assert.equal(listed.status,200);
  for(const suffix of ['?pageKey=a&pageKey=b','?unknown=x','?pageKey=%20a'])assert.equal((await handleWikiRequest(request('http://localhost/api/ops/wiki'+suffix),options(good))).status,400);
});

const opId='11111111-1111-4111-8111-111111111111';
const srId='22222222-2222-4222-8222-222222222222';
function postRequest(body, { origin } = {}) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (origin) headers.set('origin', origin);
  const controller = new AbortController();
  return { method: 'POST', url: 'http://localhost/api/ops/wiki', headers, signal: controller.signal, body: body === undefined ? undefined : new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(typeof body === 'string' ? body : JSON.stringify(body))); c.close(); } }) };
}
function postOptions(rpc, extra = {}) { return { enabled: true, sameOrigin: true, milliseconds: 25, createRpc: () => rpc, ...extra }; }
const validWithdraw = { action: 'withdraw_source', operationId: opId, sourceRevisionId: srId, reason: 'Publisher retraction notice.' };

test('POST without sameOrigin is rejected before any body read or RPC creation', async () => {
  let created = 0;
  const r = await handleWikiRequest(postRequest(validWithdraw), postOptions(good, { sameOrigin: false, createRpc: () => { created++; return good; } }));
  assert.equal(r.status, 403); assert.equal(r.body.error, 'OPS_FORBIDDEN'); assert.equal(created, 0);
});

test('POST with a query string, missing/wrong content-type, or unparseable/malformed body rejects INVALID_INPUT', async () => {
  const withQuery = { ...postRequest(validWithdraw) }; withQuery.url = 'http://localhost/api/ops/wiki?pageKey=x';
  assert.equal((await handleWikiRequest(withQuery, postOptions(good))).body.error, 'INVALID_INPUT');
  const noContentType = postRequest(validWithdraw); noContentType.headers.delete('content-type');
  assert.equal((await handleWikiRequest(noContentType, postOptions(good))).body.error, 'INVALID_INPUT');
  assert.equal((await handleWikiRequest(postRequest('not json'), postOptions(good))).body.error, 'INVALID_INPUT');
  for (const malformed of [
    { ...validWithdraw, extra: 'field' },
    { ...validWithdraw, action: 'other_action' },
    { ...validWithdraw, operationId: 'not-a-uuid' },
    { ...validWithdraw, sourceRevisionId: 'not-a-uuid' },
    { ...validWithdraw, reason: '' },
    { ...validWithdraw, reason: '  ' },
    { ...validWithdraw, reason: 'x'.repeat(501) },
  ]) {
    const r = await handleWikiRequest(postRequest(malformed), postOptions(good));
    assert.equal(r.status, 400, JSON.stringify(malformed)); assert.equal(r.body.error, 'INVALID_INPUT');
  }
});

test('failed authentication never dispatches the withdraw RPC', async () => {
  let calls = 0;
  const r = await handleWikiRequest(postRequest(validWithdraw),
    postOptions({ authenticate: async () => false, call: async () => { calls++; return { data: {}, error: null }; } }));
  assert.equal(r.status, 401); assert.equal(calls, 0);
});

test('a valid withdraw POST calls ops_source_revision_withdraw_v1 with exactly the three fields, stripping action', async () => {
  let seenName, seenInput;
  const r = await handleWikiRequest(postRequest(validWithdraw), postOptions({
    authenticate: async () => 'reviewer',
    call: async (name, input) => { seenName = name; seenInput = input; return { data: { sourceRevisionId: srId, withdrawnAt: '2026-09-17T00:00:00Z', withdrawnBy: 'reviewer', withdrawalReason: validWithdraw.reason }, error: null }; },
  }));
  assert.equal(r.status, 200);
  assert.equal(seenName, 'ops_source_revision_withdraw_v1');
  assert.deepEqual(seenInput, { p_input: { operationId: opId, sourceRevisionId: srId, reason: validWithdraw.reason } });
  assert.deepEqual(r.body, { data: { sourceRevisionId: srId, withdrawnAt: '2026-09-17T00:00:00Z', withdrawnBy: 'reviewer', withdrawalReason: validWithdraw.reason } });
});

test('known RPC errors from the withdraw RPC map to their documented status; unknown errors become OPS_ACK_UNKNOWN', async () => {
  for (const [message, status] of [['OPS_FORBIDDEN', 403], ['OPS_NOT_FOUND', 404], ['OPS_CONFLICT', 409], ['INVALID_INPUT', 400]]) {
    const r = await handleWikiRequest(postRequest(validWithdraw), postOptions({ authenticate: async () => 'reviewer', call: async () => ({ data: null, error: { message } }) }));
    assert.equal(r.status, status); assert.equal(r.body.error, message);
  }
  const unknown = await handleWikiRequest(postRequest(validWithdraw), postOptions({ authenticate: async () => 'reviewer', call: async () => ({ data: null, error: { message: 'SOMETHING_NEW' } }) }));
  assert.equal(unknown.status, 503); assert.equal(unknown.body.error, 'OPS_ACK_UNKNOWN');
});

test('an oversized POST body is rejected without ever completing the read', async () => {
  const bigReason = 'x'.repeat(5000);
  const r = await handleWikiRequest(postRequest({ ...validWithdraw, reason: bigReason }), postOptions(good));
  assert.equal(r.status, 413); assert.equal(r.body.error, 'INVALID_INPUT');
});
