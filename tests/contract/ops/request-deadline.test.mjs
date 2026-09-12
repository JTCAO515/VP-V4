import test from 'node:test';
import assert from 'node:assert/strict';
import { handleOpsRequest } from '../../../lib/server/knowledge/review/http-workspace.ts';
import { requestLifetime } from '../../../lib/server/knowledge/review/request-lifetime.ts';
import { dispatchOpsOperation } from '../../../lib/server/knowledge/review/pending-operation.ts';
const input={action:'submit',operationId:'12345678-1234-4123-8123-123456789012',candidateId:'22345678-1234-4123-8123-123456789012',title:'Candidate',content:'Private text'};
const never=()=>new Promise(()=>{});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function request(body,controller=new AbortController()) { return {method:'POST',url:'http://localhost/api/ops/review',headers:new Headers({'content-type':'application/json'}),signal:controller.signal,get body(){return body;}}; }
function stream(value=JSON.stringify(input)){return new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(value));c.close();}});}
function options(rpc,extra={}) {return {enabled:true,sameOrigin:true,milliseconds:25,createRpc:()=>rpc,...extra};}
const good={authenticate:async()=>"author",call:async()=>({data:{},error:null})};
test('disabled, bearer, origin and failed auth reject before body reader acquisition',async()=>{
 for(const variant of ['disabled','bearer','origin','auth']){
  let reads=0,calls=0;const req=request(null);Object.defineProperty(req,'body',{get(){reads++;throw Error('must not read');}});
  if(variant==='bearer')req.headers.set('authorization','Bearer synthetic');
  const r=await handleOpsRequest(req,options({...good,authenticate:async()=>variant==='auth'?false:'author',call:async()=>{calls++;return{data:{},error:null};}},{enabled:variant!=='disabled',sameOrigin:variant!=='origin'}));
  assert.ok([401,403,503].includes(r.status));assert.equal(reads,0);assert.equal(calls,0);
 }
});
test('never-ending body and hostile cancel are bounded; no RPC starts',async()=>{
 let calls=0,cancels=0;
 const body={getReader(){return {read:never,cancel(){cancels++;return never();}};}};
 const start=Date.now();const r=await handleOpsRequest(request(body),options({...good,call:async()=>{calls++;return{data:{},error:null};}}));
 assert.equal(r.status,503);assert.ok(Date.now()-start<500);assert.equal(cancels,1);assert.equal(calls,0);
});
test('late auth resolution after timeout/abort cannot acquire body or dispatch RPC',async()=>{
 for(const mode of ['timeout','abort']){
  let resolveAuth,reads=0,calls=0;const controller=new AbortController();const req=request(null,controller);
  Object.defineProperty(req,'body',{get(){reads++;return stream();}});
  const run=handleOpsRequest(req,options({authenticate:()=>new Promise(r=>{resolveAuth=r;}),call:async()=>{calls++;return{data:{},error:null};}}));
  if(mode==='abort')controller.abort();
  assert.equal((await run).status,503);resolveAuth("author");await pause(10);assert.equal(reads,0);assert.equal(calls,0);
 }
});
test('one shared deadline covers auth plus body; dispatched hung RPC is acknowledgement unknown',async()=>{
 let calls=0;
 const r=await handleOpsRequest(request({getReader:()=>({read:never,cancel:never})}),options({authenticate:async()=>{await pause(15);return "author";},call:async()=>{calls++;return{data:{},error:null};}}));
 assert.equal(r.status,503);assert.equal(calls,0);
 // Cancel only after the RPC has started: scheduler load must not turn this
 // acknowledgement test into a pre-dispatch deadline test.
 const controller=new AbortController();let dispatched=false;
 const unknown=await handleOpsRequest(request(stream(),controller),options({...good,call:()=>{dispatched=true;controller.abort();return never();}},{milliseconds:5000}));
 assert.equal(dispatched,true);assert.equal(unknown.body.error,'OPS_ACK_UNKNOWN');
});
test('lifetime prevents delayed fetch/refresh work even if its dependency ignores abort',async()=>{
 const lifetime=requestLifetime(new AbortController().signal,20);let sends=0;
 await assert.rejects(lifetime.run(never));
 await assert.rejects(lifetime.run(async()=>{sends++;return 'late';}));
 assert.equal(sends,0);lifetime.dispose();
});
test('lost acknowledgement replays exact input once; actor changes and stale completions cannot replay',async()=>{
 const pending={actorId:'author',input};let saved=0;const receipts=new Set();const seen=[];let first=true;
 const io={currentActor:async()=> 'author',isCurrent:()=>true,send:async payload=>{seen.push(payload);if(!receipts.has(payload.operationId)){receipts.add(payload.operationId);saved++;}if(first){first=false;throw Error('response lost');}return {ok:true,status:200};}};
 assert.equal(await dispatchOpsOperation(pending,io),'unknown');assert.equal(await dispatchOpsOperation(pending,io),'confirmed');assert.equal(saved,1);assert.equal(seen[0],seen[1]);
 assert.equal(await dispatchOpsOperation(pending,{...io,currentActor:async()=> 'other'}),'identity-changed');assert.equal(seen.length,2);
 assert.equal(await dispatchOpsOperation(pending,{...io,isCurrent:()=>false}),'stale');assert.equal(seen.length,2);
 let current=true;assert.equal(await dispatchOpsOperation(pending,{...io,send:async()=>{current=false;return{ok:true,status:200};},isCurrent:()=>current}),'stale');
});

test('credential actor assertion rejects Cookie-switch drift before reading body',async()=>{
 const req=request(null);req.headers.set('x-ops-expected-actor','previous-actor');let reads=0;
 Object.defineProperty(req,'body',{get(){reads++;return stream();}});
 const result=await handleOpsRequest(req,options(good));assert.equal(result.status,403);assert.equal(reads,0);
});
