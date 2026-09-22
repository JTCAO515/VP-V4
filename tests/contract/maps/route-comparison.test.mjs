import assert from 'node:assert/strict';
import test from 'node:test';
import { compareRoutes } from '../../../lib/server/maps/route-comparison.ts';
const env = { AMAP_ROUTES_ENABLED: 'true', AMAP_DETAIL_ENABLED: 'true', AMAP_WEB_SERVICE_KEY: 'synthetic-secret' };
const parameters = (extra = {}) => new URLSearchParams({ provider: 'amap', originId: 'start', destinationId: 'end', departure: 'now', ...extra });
function fixture(overrides = {}) {
  const calls = [];
  return { calls, fetcher: async (url) => {
    calls.push(url);
    if (url.pathname.includes('place/detail')) {
      const id = url.searchParams.get('id');
      return Response.json({ status: '1', infocode: '10000', pois: [{ id, name: `地点-${id}`, citycode: '021', address: '中文地址', location: id === 'start' ? '121.4,31.2' : '121.5,31.3', ...overrides.detail }] });
    }
    if (overrides.throw) throw new DOMException('synthetic', overrides.throw);
    const transit = url.pathname.includes('transit');
    return Response.json({ status: '1', infocode: '10000', route: {
      origin: '121.4,31.2', destination: '121.5,31.3',
      [transit ? 'transits' : 'paths']: [{ distance: '1000', cost: { duration: '600', tolls: '5', transit_fee: '3' }, steps: [{ instruction: '沿路前行' }], segments: [{ walking: { distance: '100', steps: [{ instruction: '步行到站' }] }, bus: { buslines: [{ name: '2号线' }] } }] }], ...overrides.route,
    } });
  } };
}
test('three whole AMap options retain endpoints, timing, estimates and safe handoff', async () => {
  const f = fixture(); const result = await compareRoutes(parameters(), { env, fetcher: f.fetcher });
  assert.equal(result.status, 200); assert.equal(f.calls.length, 5);
  const body = result.body;
  assert.deepEqual(body.options.map(o => o.status), ['observed', 'observed', 'observed']);
  assert.equal(body.options[1].walkingMeters, 100); assert.equal(body.options[1].transfers, 0);
  assert.equal(body.options[2].estimateKind, 'tolls_only');
  assert.equal(Date.parse(body.expiresAt) - Date.parse(body.observedAt), 300000);
  for (const o of body.options) {
    assert.equal(Date.parse(o.arrivalAt) - Date.parse(o.departureAt), 600000);
    const link = new URL(o.webUrl); assert.equal(link.hostname, 'uri.amap.com');
    assert.equal(link.searchParams.get('coordinate'), 'gaode');
    assert.match(link.searchParams.get('to'), /^121\.500000,31\.300000,地点-end$/);
  }
  assert.equal(JSON.stringify(body).includes('synthetic-secret'), false);
  assert.equal(f.calls[3].searchParams.get('city1'), '021');
});
test('invalid endpoints, future departure, disabled routes dispatch nothing', async () => {
  for (const [params, config, status] of [[parameters({ originId: 'end' }), env, 400], [parameters({ provider: 'tencent' }), env, 400], [parameters({ departure: '2026-09-23' }), env, 422], [parameters(), {}, 503]]) {
    assert.equal((await compareRoutes(params, { env: config, fetcher: () => { throw Error('must not dispatch'); } })).status, status);
  }
});
test('mismatched POI IDs and absent coordinates never route', async () => {
  for (const detail of [{ id: 'unrelated' }, { location: '' }, { location: ',' }]) {
    const f = fixture({ detail }); const r = await compareRoutes(parameters(), { env, fetcher: f.fetcher });
    assert.notEqual(r.status, 200); assert.equal(f.calls.length, 2);
  }
});
test('no routes, endpoint mismatch and timeout remain distinct', async () => {
  for (const [overrides, status] of [[{ route: { paths: [], transits: [] } }, 'no_routes'], [{ route: { destination: '120,30' } }, 'endpoint_mismatch'], [{ throw: 'TimeoutError' }, 'timeout']]) {
    const f = fixture(overrides); const r = await compareRoutes(parameters(), { env, fetcher: f.fetcher });
    assert.deepEqual(r.body.options.map(o => o.status), [status, status, status]);
    assert.equal(r.body.options.some(o => o.webUrl), false);
  }
});
test('missing city disables only transit; unsupported rail is not dropped', async () => {
  const f = fixture({ detail: { citycode: null } }); const r = await compareRoutes(parameters(), { env, fetcher: f.fetcher });
  assert.equal(r.body.options[1].status, 'city_unknown'); assert.equal(f.calls.length, 4);
  const g = fixture({ route: { transits: [{ distance: '100', cost: { duration: '10' }, segments: [{ railway: { name: 'train' } }] }] } });
  assert.equal((await compareRoutes(parameters(), { env, fetcher: g.fetcher })).body.options[1].status, 'unsupported_segment');
});
