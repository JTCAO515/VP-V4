import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {isCommunityInput} from '../../../lib/server/community/request.ts';
import {handleCommunityRequest} from '../../../lib/server/community/http.ts';
const submit=()=>({action:'submit',operationId:uuid(),submissionId:uuid(),title:'旅行体验',content:'Synthetic experience',consent:'internal-review-v1'});
test('closed input rejects forged authority, publication, consent and unbounded content',()=>{
 const input=submit(); assert.ok(isCommunityInput(input));
 for(const change of [{authorId:uuid()},{status:'published'},{reviewerId:uuid()},{consent:null},{content:' '},{title:'x'.repeat(161)},{action:'publish'}]) assert.equal(isCommunityInput({...input,...change}),false);
 assert.ok(isCommunityInput({action:'mine'}));assert.ok(isCommunityInput({action:'queue'}));
 assert.equal(isCommunityInput({action:'queue',authorId:uuid()}),false);
 const review={action:'review',operationId:uuid(),submissionId:uuid(),expectedVersion:1,decision:'approve',note:'Internal note'};
 assert.ok(isCommunityInput(review)); assert.equal(isCommunityInput({...review,expectedVersion:2}),false);
 assert.ok(isCommunityInput({action:'withdraw',operationId:uuid(),submissionId:uuid(),expectedVersion:2}));
});
function request(body=submit(),headers={}){return new Request('https://internal.example/api/ops/community',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});}
function options(extra={}){return {enabled:true,sameOrigin:true,createRpc:()=>({authenticate:async()=> 'actor',call:async(name,args)=>{assert.equal(name,'community_workspace');return {data:args.p_input,error:null};}}),...extra};}
test('actual HTTP handler rejects disabled, cross-origin, bearer and actor mismatch before dispatch',async()=>{
 let calls=0;const createRpc=()=>{calls++;throw Error('unexpected');};
 for(const [opts,req,status] of [[{enabled:false},request(),503],[{sameOrigin:false},request(),403],[{},request(submit(),{authorization:'Bearer untrusted'}),401]]) {
  assert.equal((await handleCommunityRequest(req,options({...opts,createRpc}))).status,status);
 }assert.equal(calls,0);
 assert.equal((await handleCommunityRequest(request(submit(),{'x-community-expected-actor':'different'}),options())).status,403);
 assert.equal((await handleCommunityRequest(request({...submit(),authorId:uuid()}),options())).status,400);
 assert.equal((await handleCommunityRequest(request(),options())).status,200);
});
test('read defaults to mine, bounds body and hides database error details',async()=>{
 const result=await handleCommunityRequest(new Request('https://internal.example/api/ops/community'),options());assert.deepEqual(result.body.data,{action:'mine'});
 assert.equal((await handleCommunityRequest(request({...submit(),content:'x'.repeat(25000)}),options())).status,413);
 const failure=await handleCommunityRequest(request(),options({createRpc:()=>({authenticate:async()=> 'actor',call:async()=>({data:null,error:{message:'private SQL body or customer text'}})})}));
 assert.deepEqual(failure,{status:503,body:{error:'COMMUNITY_ACK_UNKNOWN'}});
});
test('dispatched timeout is unknown acknowledgement, never claimed rollback',async()=>{
 const result=await handleCommunityRequest(request(),options({milliseconds:15,createRpc:()=>({authenticate:async()=> 'actor',call:()=>new Promise(()=>{})})}));
 assert.equal(result.body.error,'COMMUNITY_ACK_UNKNOWN');
});
