import test from 'node:test';
import assert from 'node:assert/strict';
import { permitsControlEnvelope, readControlBody } from '../../../lib/server/observability/ops-control/envelope.ts';
import { requestLifetime } from '../../../lib/server/knowledge/review/request-lifetime.ts';
const make = (body='{}', headers={}) => new Request('https://example.test/api/ops/controls', {
  method:'POST', headers:{origin:'https://example.test','content-type':'application/json',...headers}, body,
});
test('Cookie control requires exact same origin and rejects bearer/cross-site/query', () => {
  assert.equal(permitsControlEnvelope(make()), true);
  for (const headers of [{origin:'https://evil.test'}, {authorization:'Bearer synthetic'}, {'sec-fetch-site':'cross-site'}, {'content-type':'text/plain'}])
    assert.equal(permitsControlEnvelope(make('{}',headers)), false);
  assert.equal(permitsControlEnvelope(new Request('https://example.test/api/ops/controls?city=shanghai',{method:'POST',headers:{origin:'https://example.test','content-type':'application/json'},body:'{}'})),false);
  assert.equal(permitsControlEnvelope(new Request('https://example.test/api/ops/controls',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})),false);
});
test('byte limit is enforced on actual streaming bytes; malformed UTF-8 and BOM rejected', async () => {
  for (const body of [' '.repeat(4097), Uint8Array.from([0xff]), Uint8Array.from([0xef,0xbb,0xbf,0x7b,0x7d])]) {
    const r=make(body); const life=requestLifetime(r.signal);
    try { await assert.rejects(readControlBody(r,life)); } finally {life.dispose();}
  }
  const r=make('{"action":"workspace"}');const life=requestLifetime(r.signal);
  try {assert.deepEqual(await readControlBody(r,life),{action:'workspace'});} finally {life.dispose();}
});
test('aborted request cannot finish reading its body', async () => {
  const controller=new AbortController();controller.abort();
  const r=make();const life=requestLifetime(controller.signal);
  try {await assert.rejects(readControlBody(r,life));} finally {life.dispose();}
});
