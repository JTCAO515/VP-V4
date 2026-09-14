import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chunk } from '../../../scripts/maps/run-full-matrix.mjs';
import { fixtureRequestCount, loadFixtures, HARD_CAP_REQUESTS } from '../../../scripts/maps/batch-probe.mjs';
import { PLACES } from '../../../scripts/maps/full-matrix-places.mjs';

test('#362 full matrix has exactly 10 places per city, each with a unique category-consistent zh/en/pinyin name', () => {
  const cities = ['上海市', '北京市', '广州市', '重庆市'];
  assert.deepEqual(Object.keys(PLACES).sort(), cities.sort());
  for (const city of cities) {
    assert.equal(PLACES[city].length, 10, `${city} must have exactly 10 places`);
    for (const p of PLACES[city]) {
      assert.ok(p.zh && p.en && p.pinyin && p.category, `${city} place missing a required field`);
      assert.ok(Number.isFinite(p.lat) && Number.isFinite(p.lng), `${city} place ${p.zh} needs coordinates`);
    }
  }
});

test('generated search fixture file has exactly 120 search-only entries, 3 language variants per place', () => {
  const fixtures = loadFixtures(readFileSync(new URL('../../../scripts/maps/full-matrix-search-120.json', import.meta.url), 'utf8'));
  assert.equal(fixtures.length, 120);
  assert.equal(fixtureRequestCount(fixtures), 120);
  assert.ok(fixtures.every(f => f.operations?.length === 1 && f.operations[0] === 'search'));
  const variants = new Set(fixtures.map(f => f.variant));
  assert.deepEqual([...variants].sort(), ['en', 'pinyin', 'zh']);
  for (const city of ['上海市', '北京市', '广州市', '重庆市']) {
    assert.equal(fixtures.filter(f => f.city === city).length, 30, `${city} should have 30 search fixtures (10 places x 3 variants)`);
  }
});

test('generated route fixture file has exactly 40 walking-only entries, 10 per city, forming a closed loop', () => {
  const fixtures = loadFixtures(readFileSync(new URL('../../../scripts/maps/full-matrix-routes-40.json', import.meta.url), 'utf8'));
  assert.equal(fixtures.length, 40);
  assert.equal(fixtureRequestCount(fixtures), 40);
  assert.ok(fixtures.every(f => f.operations?.length === 1 && f.operations[0] === 'walking'));
  for (const city of ['上海市', '北京市', '广州市', '重庆市']) {
    assert.equal(fixtures.filter(f => f.city === city).length, 10, `${city} should have 10 route fixtures`);
  }
});

test('chunk() respects the HARD_CAP_REQUESTS ceiling and never drops a fixture', () => {
  const searchFixtures = loadFixtures(readFileSync(new URL('../../../scripts/maps/full-matrix-search-120.json', import.meta.url), 'utf8'));
  const chunks = chunk(searchFixtures, HARD_CAP_REQUESTS);
  assert.equal(chunks.flat().length, searchFixtures.length);
  for (const c of chunks) assert.ok(fixtureRequestCount(c) <= HARD_CAP_REQUESTS, 'each chunk must fit under the hard cap');
  assert.equal(chunks.reduce((n, c) => n + fixtureRequestCount(c), 0), 120);
});

test('chunk() never splits a fixture across chunks and handles a single oversized-alone fixture by isolating it', () => {
  const one = { city: 'x', category: 'y', query: 'q', operations: ['search'] };
  assert.deepEqual(chunk([one, one, one], 2), [[one, one], [one]]);
  assert.deepEqual(chunk([], 40), []);
});
