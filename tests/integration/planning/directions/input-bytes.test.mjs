import test from 'node:test';
import assert from 'node:assert/strict';
import {directionsInputBytes} from '../../../../lib/server/planning/directions/input-bytes.ts';
const run=async f=>await f();
const read=body=>directionsInputBytes(new Request('https://test.invalid',{method:'POST',body}),run);
test('mutation bytes preserve whitespace/key order/number spelling and UTF8',async()=>{
 const raw=' { "b" : 1.0, "a": "上海" }\n';assert.equal(await read(raw),raw);
 assert.notEqual(await read('{"a":1,"b":2}'),await read('{ "b":2, "a":1 }'));
});
test('16KB UTF8 byte cap, invalid UTF8, BOM and malformed JSON reject without reserialization',async()=>{
 assert.equal(await read('"'+'界'.repeat(5500)+'"'),null);
 assert.equal(await read(new Uint8Array([123,34,120,34,58,34,255,34,125])),null);
 assert.equal(await read('\ufeff{"x":1}'),null);assert.equal(await read('{'),null);
 const raw='"'+'a'.repeat(16382)+'"';assert.equal(new TextEncoder().encode(raw).length,16384);assert.equal(await read(raw),raw);
});
