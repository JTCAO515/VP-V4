import assert from 'node:assert/strict';
import test from 'node:test';
import {libraryPlaceCapabilities} from '../../../lib/server/library/place-capabilities.ts';
import {libraryNativePlaceHTTP} from '../../../lib/server/library/native-place-http.ts';
const id='12345678-1234-4234-8234-123456789abc';
test('qualified exact canonical and owned Trip produce only recheck-required Ask navigation, not Save/Add/visual success',()=>{
 const caps=libraryPlaceCapabilities(id,id);assert.equal(caps.ask.status,'available');if(caps.ask.status==='available'){assert.equal(caps.ask.handoff.readiness,'recheck_required');assert.equal(caps.ask.reference.tripId,id);assert.equal(caps.ask.handoff.poiId,id);}
 assert.deepEqual(caps.save,{status:'unavailable',reason:'DOMAIN_WRITER_MISSING'});assert.deepEqual(caps.add,{status:'unavailable',reason:'NO_ELIGIBLE_EVIDENCE'});assert.deepEqual(caps.visual,{status:'unavailable',reason:'NO_LICENSED_VISUAL'});
 for(const pair of [[null,id],[id,null],['display-label',id]] as const)assert.equal(libraryPlaceCapabilities(pair[0],pair[1]).ask.status,'unavailable');
});
test('place source surface does not accept arbitrary actions/credentials/URLs or implicit location',async()=>{
 const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('No outbound');};try{for(const tail of ['?provider=amap&providerPoiId=x&action=save','?provider=amap&providerPoiId=x&url=https://example.test','?provider=amap&providerPoiId=x&tripId=unknown','?provider=unknown&providerPoiId=x'])assert.equal((await libraryNativePlaceHTTP(new Request('http://localhost/place'+tail))).status,400);assert.equal(calls,0);}finally{globalThis.fetch=old;}
});
