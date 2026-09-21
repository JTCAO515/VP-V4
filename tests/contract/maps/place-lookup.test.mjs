import assert from 'node:assert/strict';
import test from 'node:test';
import { lookupPlace } from '../../../lib/server/maps/place-lookup.ts';

test('place lookup rejects invalid action, coordinates and category before dispatch', async () => {
  const dependencies = { env: {}, serviceClient: null, fetcher: async () => { throw new Error('unexpected dispatch'); } };
  for (const query of ['provider=amap&action=delete', 'provider=amap&action=nearby&lat=31&lng=121&system=wgs84&category=atm', 'provider=amap&action=nearby&lat=NaN&lng=121&system=gcj02&category=atm', 'provider=amap&action=nearby&lat=31&lng=121&system=gcj02&category=hospital', 'provider=amap&action=detail&id=']) {
    assert.equal((await lookupPlace(new URLSearchParams(query), dependencies)).status, 400);
  }
  assert.equal((await lookupPlace(new URLSearchParams('provider=amap&action=detail&id=place-1'), dependencies)).status, 503);
});

test('detail retains provider identity, GCJ02 and unknown entrance without exposing credentials', async () => {
  let calls = 0;
  const result = await lookupPlace(new URLSearchParams('provider=amap&action=detail&id=place-1'), {
    env: { AMAP_DETAIL_ENABLED: 'true', AMAP_WEB_SERVICE_KEY: 'synthetic-secret' }, serviceClient: null,
    fetcher: async () => { calls++; return Response.json({ status: '1', infocode: '10000', pois: [{ id: 'place-1', name: '测试地点', address: '测试地址', location: '121.4,31.2' }] }); },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.detail.providerPoiId, 'place-1');
  assert.deepEqual(result.body.detail.location, { lat: 31.2, lng: 121.4, coordinateSystem: 'gcj02' });
  assert.equal(result.body.evidenceKind, 'provider_observation');
  assert.equal(result.body.entrance, 'unknown');
  assert.equal(result.body.specialServices, 'unknown');
  assert.ok(result.body.observedAt);
  assert.equal(JSON.stringify(result).includes('synthetic-secret'), false);
  assert.equal(calls, 1);
});
