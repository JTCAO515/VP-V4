import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

// One bounded observation-only check: no network, fixture, SQL or Guide rerun.
test('diagnostic write/log failure preserves the exact business response and original fetch error', async () => {
  const priorFetch = globalThis.fetch, priorWrite = fs.writeFileSync, priorLog = console.log;
  const priorFlag = process.env.VP_GUIDE_HTTP_INTEGRATION, priorAPI = process.env.VP_IDENTITY_SUPABASE_API_URL;
  const url = 'http://127.0.0.1:60861/rest/v1/rpc/guide_place_v1';
  const body = JSON.stringify({ p_input: { action: 'follow_up', completedSegmentIds: [] } });
  let calls = 0;
  try {
    process.env.VP_GUIDE_HTTP_INTEGRATION = 'true'; process.env.VP_IDENTITY_SUPABASE_API_URL = 'http://127.0.0.1:60861';
    const response = Response.json({ code: '55P03', message: 'Owned test error' }, { status: 503 });
    globalThis.fetch = async () => { calls++; return response; };
    fs.writeFileSync = () => { throw Error('Synthetic observation I/O failure'); }; syncBuiltinESMExports();
    console.log = () => { throw Error('Synthetic observation logging failure'); };
    await import('../../../../lib/server/privacy/profile-data/observe-guide-conflict.mjs?noninterference-response');
    assert.equal(await globalThis.fetch(url, { method: 'POST', body }), response);
    assert.equal(calls, 1); assert.equal(response.status, 503); assert.equal((await response.json()).code, '55P03');
    const failure = Error('Original fetch transport failure');
    globalThis.fetch = async () => { calls++; throw failure; };
    await import('../../../../lib/server/privacy/profile-data/observe-guide-conflict.mjs?noninterference-error');
    await assert.rejects(globalThis.fetch(url, { method: 'POST', body }), error => error === failure);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = priorFetch; fs.writeFileSync = priorWrite; syncBuiltinESMExports(); console.log = priorLog;
    priorFlag === undefined ? delete process.env.VP_GUIDE_HTTP_INTEGRATION : process.env.VP_GUIDE_HTTP_INTEGRATION = priorFlag;
    priorAPI === undefined ? delete process.env.VP_IDENTITY_SUPABASE_API_URL : process.env.VP_IDENTITY_SUPABASE_API_URL = priorAPI;
  }
});
