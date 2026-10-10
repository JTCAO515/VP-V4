import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID as uuid} from 'node:crypto';
import {validDirectionsTripReference,nativeDirectionsTripReferenceHTTP} from '../../../../lib/server/planning/directions/native-trip-reference.ts';
test('typed Trip reference is exact identity only; no archive, cross-Trip or inline action grant',()=>{
 const trip=uuid(),ref={kind:'result_reference',tripId:trip,artifactId:uuid(),revision:1};assert.equal(validDirectionsTripReference(ref,trip),true);assert.equal(validDirectionsTripReference({kind:'empty'},trip),true);assert.equal(validDirectionsTripReference({kind:'unavailable'},trip),true);
 for(const bad of [{...ref,tripId:uuid()},{...ref,archiveHistorical:true},{...ref,revision:0},{...ref,revision:1001},{...ref,content:{actions:['confirm']}},{kind:'empty',tripId:trip}])assert.equal(validDirectionsTripReference(bad,trip),false);
});

test('Native identity GET rejects body/nonzero transport semantics before any credential or RPC work',async()=>{
 const url=new URL('http://127.0.0.1/api/results/native/v2/trip-directions?tripId='+uuid());
 for(const variant of [{body:{}},{headers:new Headers({'content-length':'1'})},{headers:new Headers({'transfer-encoding':'chunked'})}]){
  const request={method:'GET',nextUrl:url,url:url.href,headers:new Headers(),body:null,signal:new AbortController().signal,...variant};const r=await nativeDirectionsTripReferenceHTTP(request);assert.equal(r.status,400);assert.deepEqual(await r.json(),{error:{code:'INVALID_INPUT'}});
 }
});
