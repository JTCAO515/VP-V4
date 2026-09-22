import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server.js';
import { nativeTripHTTP } from '../../../lib/server/trip/native-http.ts';
import { isArchiveInput } from '../../../lib/server/trip/archive/contract.ts';
import { nativeFixture, subject, sessionId } from '../identity/native-fixture.ts';
const tripId = '314b8576-e9e7-49aa-aa66-94eac6ba6544';
const input = { expectedVersion: 1, idempotencyKey: 'fb2c981e-7e5f-4b07-9f79-af7b907e4f4a', confirmed: true };

test('archive requires explicit consent, exact version and a closed input', () => {
  assert.equal(isArchiveInput(input), true);
  for (const bad of [null, {}, {...input, confirmed: false}, {...input, expectedVersion: 0}, {...input, expectedVersion: 1.1}, {...input, ownerId: tripId}, {...input, idempotencyKey: 'bad'}]) assert.equal(isArchiveInput(bad), false);
});
test('native archive HTTP forwards ordinary actor intent, returns persisted receipt, fails closed on unavailable schema', async t => {
  const database = 'https://dzqdzetcctkhbrhlxxgn.supabase.co';
  const host = 'vp-v4-archive-jtcao515s-projects.vercel.app';
  const f = await nativeFixture(t, database);
  const env = { VERCEL_ENV: 'preview', VERCEL_URL: host, VISEPANDA_NATIVE_STAGING: 'true', VISEPANDA_TRIP_PROTOCOL_V2: 'true', NEXT_PUBLIC_SUPABASE_URL: database, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: f.config.publishableKey };
  const old = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
  t.after(() => { for (const [k,v] of Object.entries(old)) v === undefined ? delete process.env[k] : process.env[k] = v; });
  Object.assign(process.env, env);
  const previous = globalThis.fetch;
  let unavailable = false, posts = 0;
  t.mock.method(globalThis, 'fetch', async (i, init) => {
    const req = new Request(i, init), path = new URL(req.url).pathname;
    if (path.endsWith('/native_session_v2')) return Response.json({ subject, sessionId, mobileEpoch: 1 });
    if (path.endsWith('/archive_trip_v1')) {
      posts++;
      assert.equal(req.headers.get('authorization'), 'Bearer ' + f.token);
      assert.deepEqual(await req.json(), {p_trip_id:tripId,p_expected_version:1,p_idempotency_key:input.idempotencyKey,p_confirmed:true});
      if (unavailable) return Response.json({ message: 'function unavailable' }, { status: 404 });
      return Response.json([{trip_id:tripId,archived_version:1,archived_at:'2026-09-22T01:00:00Z',reused:false}]);
    }
    return previous(i, init);
  });
  const request = (body = input, headers = {}) => new NextRequest(`https://${host}/api/trips/native/v2/${tripId}/archive`, {method:'POST',headers:{Authorization:'Bearer '+f.token,...headers},body:JSON.stringify(body)});
  const r = await nativeTripHTTP(request(), 'archive', tripId);
  assert.equal(r.status,200);
  assert.deepEqual(await r.json(),{version:1,archive:{tripId,archivedVersion:1,archivedAt:'2026-09-22T01:00:00Z'},reused:false});
  assert.equal((await nativeTripHTTP(request({...input,confirmed:false}),'archive',tripId)).status,400);
  assert.equal((await nativeTripHTTP(request(input,{Origin:'https://evil.invalid'}),'archive',tripId)).status,400);
  assert.equal(posts,1);
  unavailable=true;
  assert.equal((await nativeTripHTTP(request(),'archive',tripId)).status,503);
});
