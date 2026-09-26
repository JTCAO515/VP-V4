import test from 'node:test';
import assert from 'node:assert/strict';
import { runTripDeletionPoll } from '../../../lib/server/jobs/run-staging-trip-deletion.mjs';

const requestId = 'fb2c981e-7e5f-4b07-9f79-af7b907e4f4a';
const receipt = { version: 1, requestId, tripId: '314b8576-e9e7-49aa-aa66-94eac6ba6544',
  scope: 'trip-core-v1', state: 'completed', completedAt: '2026-09-26T00:00:00Z', allUserDataCompleted: false };
const json = value => Response.json(value, { headers: { 'Content-Type': 'application/json' } });

test('staging worker consumes only service queue IDs, verifies terminal receipt and stops on empty', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return json(calls.length === 1 ? requestId : calls.length === 2 ? receipt : null);
  };
  assert.deepEqual(await runTripDeletionPoll({ key: 'sb_secret_fixture', fetcher, cycles: 3 }),
    { completed: 1, empty: true });
  assert.equal(calls.length, 3);
  assert.ok(calls.every(call => call.url.startsWith('https://dzqdzetcctkhbrhlxxgn.supabase.co/rest/v1/rpc/')));
  assert.ok(calls.every(call => call.options.headers.apikey === 'sb_secret_fixture' && !call.options.headers.authorization));
  assert.deepEqual(JSON.parse(calls[1].options.body), { p_request_id: requestId });
});

test('worker never reports completion from an untrusted or queued receipt', async () => {
  for (const bad of [{ ...receipt, state: 'queued', completedAt: null }, { ...receipt, allUserDataCompleted: true },
    { ...receipt, requestId: '314b8576-e9e7-49aa-aa66-94eac6ba6544' }]) {
    let calls = 0;
    await assert.rejects(runTripDeletionPoll({ key: 'sb_secret_fixture', cycles: 1, fetcher: async () =>
      json(++calls === 1 ? requestId : bad) }), /unavailable/);
  }
  await assert.rejects(runTripDeletionPoll({ key: 'sb_secret_fixture', cycles: 1,
    fetcher: async () => Response.redirect('https://evil.invalid') }), /unavailable/);
});
