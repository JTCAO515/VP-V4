import test from 'node:test';
import assert from 'node:assert/strict';
import { COVERAGE_PROGRESS_SCHEMA as scope, COVERAGE_PROGRESS_BOUNDARIES, parseCoverageProgressCommand, coverageProgressDigest } from '../../../../lib/server/privacy/coverage-progress/contract.ts';
import { coverageProgressRowKey } from '../../../../lib/server/privacy/coverage-progress/rows.ts';
import { decodeCoverageProgressPreview, decodeCoverageProgressReceipt, decodeCoverageProgressBundle } from '../../../../lib/server/privacy/coverage-progress/protocol.ts';
import { collectCoverageProgressExport } from '../../../../lib/server/privacy/coverage-progress/export.ts';
import { handleCoverageProgress } from '../../../../lib/server/privacy/coverage-progress/http.ts';
import { coverageProgressCoverageOutcome, coverageProgressCoverageRequestBody } from '../../../../lib/server/privacy/coverage-progress/coverage.ts';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const now = 1801800000000, actor = { ownerId:id(1),sessionId:id(2),mobileEpoch:1 };
const selection = { scope,requestId:id(3),objectIds:[id(4)] };
const bound = { schemaVersion:scope,...selection,...actor,sourceDigest:'a'.repeat(64),previewDigest:'b'.repeat(64),capturedAt:now,expiresAt:now+30000,boundaries:COVERAGE_PROGRESS_BOUNDARIES[scope],allUserDataCompleted:false };
const original = {requestId:id(4),ownerId:actor.ownerId,sessionId:id(8),scope:'trip-lifecycle-metadata/1',expiresAt:now-30000};
const retained = {objectId:id(4),domain:'collector',request:null,sections:[],fence:original};
const command = {...selection,action:'export',previewDigest:bound.previewDigest,confirmed:true};
const raw = '\n'+JSON.stringify(command), digest = coverageProgressDigest(raw);
function sourceRPC(mutate = v=>v) {
  return async action => {
    let value;
    if(action==='export_start') value={...bound,kind:'started',requestDigest:digest,limits:{pageSize:5,maxPages:4,maxRows:20,maxBytes:1000000}};
    else if(action==='page') value={...bound,kind:'page',requestDigest:digest,items:[retained],hasMore:false,nextCursor:null,sectionComplete:true,pageNumber:1};
    else if(action==='proof') value={...bound,kind:'proof',requestDigest:digest,coverage:'complete',pages:1,rows:1};
    else throw Error('unexpected');
    return mutate(value,action);
  };
}
const effects = {collectorRequests:0,collectorSections:0,exitPages:0,retainedFences:1,sourceData:'not_modified',sessionAccountFences:'retained',externalCopies:'not_erased'};
const erase={...command,action:'erase'}, eraseBytes='\t'+JSON.stringify(erase);
const receipt={...bound,kind:'receipt',state:'erased',requestDigest:coverageProgressDigest(eraseBytes),committedAt:now+1,decidedAt:now+1,effects};

test('closed selection/recovery preserves original bytes and rejects extra authority/self-selection/false consent',()=>{
  assert.ok(parseCoverageProgressCommand(command));
  for(const delta of [{scope:null},{ownerId:id(9)},{objectIds:[id(3)]},{objectIds:[id(5),id(4)]},{objectIds:[id(4),id(4)]},{confirmed:false},{previewDigest:null},{action:null}]) assert.equal(parseCoverageProgressCommand({...command,...delta}),null);
  const recovery={...selection,action:'recover',mutationBytes:eraseBytes}; assert.ok(parseCoverageProgressCommand(recovery));
  assert.equal(parseCoverageProgressCommand({...recovery,objectIds:[id(5)]}),null);
  assert.notEqual(coverageProgressDigest(eraseBytes),coverageProgressDigest(JSON.stringify(erase)));
});

test('historical/expired fence remains exported, all columns closed, new exit metadata is flat and selectable',()=>{
  assert.equal(coverageProgressRowKey(retained,bound),id(4));
  assert.equal(coverageProgressRowKey({...retained,fence:{...original,ownerId:id(9)}},bound),null);
  assert.equal(coverageProgressRowKey({...retained,unknown:'hidden'},bound),null);
  const request={...original,mobileEpoch:1,sourceDigest:bound.sourceDigest,capturedAt:now-60000};
  const sections=['operations','trips'].map(section=>({requestId:id(4),section,lastCursor:null,nextCursor:null,lastLimit:null,pages:0,rows:0,bytes:0,terminal:false}));
  assert.equal(coverageProgressRowKey({...retained,request,sections},bound),id(4));
  assert.equal(coverageProgressRowKey({...retained,request,sections:[...sections].reverse()},bound),null);
  const exit={objectId:id(4),domain:'exit',request:{...bound,requestId:id(4),objectIds:[id(9)],decision:'erase',requestDigest:receipt.requestDigest,decidedAt:now+1,effects},progress:null};
  delete exit.request.schemaVersion;delete exit.request.boundaries;delete exit.request.allUserDataCompleted;
  assert.equal(coverageProgressRowKey(exit,bound),id(4));
  assert.equal(coverageProgressRowKey({...exit,request:{...exit.request,items:[retained]}},bound),null);
});

test('export independent row/proof/current scope validation rejects truncation, reordered source and malformed bytes',async()=>{
  const signal=new AbortController().signal;
  const bundle=await collectCoverageProgressExport(command,raw,actor,sourceRPC(),signal,async()=>true,()=>now+2);
  assert.ok(decodeCoverageProgressBundle(bundle,command,actor,now+2));assert.deepEqual(bundle.items,[retained]);
  for(const mutation of [
    (v,a)=>a==='proof'?{...v,coverage:'partial'}:v,
    (v,a)=>a==='proof'?{...v,rows:0}:v,
    (v,a)=>a==='page'?{...v,items:[]}:v,
    (v,a)=>a==='page'?{...v,sourceDigest:'c'.repeat(64)}:v,
    (v,a)=>a==='page'?{...v,items:[{...retained,fence:{...original,ownerId:id(9)}}]}:v,
    (v,a)=>a==='export_start'?{...v,expiresAt:now+60000}:v,
  ]) await assert.rejects(collectCoverageProgressExport(command,raw,actor,sourceRPC(mutation),signal,async()=>true,()=>now+2),/SOURCE_UNAVAILABLE/);
  await assert.rejects(collectCoverageProgressExport(command,raw,actor,sourceRPC(),signal,async()=>false,()=>now+2),/SOURCE_UNAVAILABLE/);
});

test('erasure receipt recovery may outlive preview but exact actor/session/digest/retention stays mandatory',()=>{
  assert.ok(decodeCoverageProgressReceipt(receipt,erase,actor,coverageProgressDigest(eraseBytes),now+60000));
  assert.equal(decodeCoverageProgressReceipt({...receipt,decidedAt:now+2},erase,actor,receipt.requestDigest,now+60000),null);
  assert.equal(decodeCoverageProgressReceipt({...receipt,effects:{...effects,retainedFences:0}},erase,actor,receipt.requestDigest,now+2),null);
  assert.equal(decodeCoverageProgressReceipt(receipt,erase,{...actor,sessionId:id(9)},receipt.requestDigest,now+2),null);
  assert.equal(decodeCoverageProgressReceipt(receipt,erase,actor,coverageProgressDigest(JSON.stringify(erase)),now+2),null);
  assert.equal(decodeCoverageProgressPreview({...bound,kind:'preview',items:[retained],requiresExplicitConfirmation:true},selection,actor,now+30000),null);
});

test('HTTP unknown ACK never completes, exact recovery bytes survive and no automatic mutation retry occurs',async()=>{
  const request=bytes=>new Request('http://localhost/api/privacy/native/v1/coverage-progress',{method:'POST',headers:{'Content-Type':'application/json'},body:bytes});
  let calls=0;
  const options={enabled:true,now:()=>now+2,authority:()=>({authenticate:async()=>actor,current:async()=>true,rpc:async(action,bytes)=>{calls++;assert.equal(bytes,eraseBytes);throw Error('connection lost');}})};
  const response=await handleCoverageProgress(request(eraseBytes),options);assert.equal(response.status,503);assert.equal((await response.json()).error.code,'COVERAGE_PROGRESS_ACK_UNKNOWN');assert.equal(calls,1);
  const recovery={...selection,action:'recover',mutationBytes:eraseBytes};
  const unknown={schemaVersion:scope,kind:'unknown',...selection,...actor,requestDigest:receipt.requestDigest,allUserDataCompleted:false};
  const reply=await handleCoverageProgress(request(JSON.stringify(recovery)),{...options,authority:()=>({authenticate:async()=>actor,current:async()=>true,rpc:async(_,bytes)=>{assert.equal(JSON.parse(bytes).mutationBytes,eraseBytes);return unknown;}})});
  assert.equal(reply.status,200);assert.deepEqual((await reply.json()).data,unknown);
  const input={moduleId:'coverage_progress',moduleVersion:scope,operationId:selection.requestId,tripId:null,phase:'recover',action:'delete',commandBytes:eraseBytes,actorId:actor.ownerId,sessionId:actor.sessionId,mobileEpoch:1};
  assert.equal(JSON.parse(coverageProgressCoverageRequestBody(input)).mutationBytes,eraseBytes);
  assert.deepEqual(coverageProgressCoverageOutcome({input,command:erase,handler:'coverage_progress'},unknown,now+2),{state:'unknown',reason:'COVERAGE_PROGRESS_ACK_UNKNOWN'});
});
