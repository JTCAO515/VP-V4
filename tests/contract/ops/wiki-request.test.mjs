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
