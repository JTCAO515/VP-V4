import assert from 'node:assert/strict';
import test from 'node:test';
import {nativeResultV2HTTP,nativeResultSearchV2HTTP,nativeResultReferenceV2HTTP,nativeChooseDecisionV2HTTP} from '../../../lib/server/artifacts/native-result-v2-http.ts';
const id='12345678-1234-4234-8234-123456789abc';
test('v2 exact/reference/search/owner decision reject extra query/duplicate IDs/actions before any credentials or RPC I/O',async()=>{
 const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected I/O');};
 try{
  for(const url of ['?artifactId='+id,'?artifactId='+id+'&revision=1&revision=2','?artifactId='+id+'&revision=1&latest=true','?artifactId='+id+'&revision=0'])assert.equal((await nativeResultV2HTTP(new Request('http://localhost/results'+url))).status,400);
  assert.equal((await nativeResultSearchV2HTTP(new Request('http://localhost/search?query=x&ownerId='+id))).status,400);
  assert.equal((await nativeResultReferenceV2HTTP(new Request('http://localhost/task?taskId='+id+'&tripId='+id),'task')).status,400);
  assert.equal((await nativeChooseDecisionV2HTTP(new Request('http://localhost/decision?confirm=true',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}))).status,400);
  assert.equal((await nativeChooseDecisionV2HTTP(new Request('http://localhost/decision',{method:'POST',headers:{'content-type':'application/json',cookie:'unsafe'},body:'{}'}))).status,400);assert.equal(calls,0);
 }finally{globalThis.fetch=old;}
});
