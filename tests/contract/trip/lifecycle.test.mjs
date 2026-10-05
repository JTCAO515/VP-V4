import test from 'node:test';
import assert from 'node:assert/strict';
import { isLifecycleCommand, isLifecycleSnapshot, isLifecycleReceipt, isLifecycleRecovery } from '../../../lib/server/trip/lifecycle/contract.ts';
import { lifecycleOperations, lifecycleDigest } from '../../../lib/server/trip/lifecycle/operations.ts';
import { lifecycleBody, lifecyclePageInput, lifecycleRawBody } from '../../../lib/server/trip/lifecycle/http-input.ts';
import { nativeRequestScope } from '../../../lib/server/identity/native-request.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ownerId=id(1),sessionId=id(2),tripId=id(3),operationId=id(4);
const common={operationId,expectedRevision:8,expectedActiveTripId:null,expectedSessionId:sessionId,confirmed:true,tripId};
const create={...common,action:'create',title:'Next journey'};
const refs=[{memoryId:id(5),revision:2,sourceReceiptId:id(6),consentId:id(7)}];
const archive={...common,action:'archive',expectedHeadVersion:3,preference:{action:'keep',memoryRefs:refs}};
const capacity={draftCount:1,draftLimit:3,activeTripId:null,activeLimit:1,legacyCount:0};
const snapshot={version:'trip-lifecycle/1',ownerId,sessionId,revision:8,capacity,trips:[],nextTripId:null,serviceStatus:'unavailable'};
const applied=(command,bytes=JSON.stringify(command))=>({status:'applied',version:'trip-lifecycle/1',ownerId,sessionId,operationId:command.operationId,requestDigest:lifecycleDigest(bytes),action:command.action,revision:9,tripId:command.tripId,state:command.action==='archive'?'archived':'draft',capacity,archivedVersion:command.action==='archive'?3:null,archivedAt:command.action==='archive'?'2026-10-05T06:00:00.000Z':null,preference:command.action==='archive'?'kept':'not_requested',memoryRefs:command.action==='archive'?refs:[]});
const declined=(command,bytes=JSON.stringify(command))=>({version:'trip-lifecycle/1',ownerId,sessionId,operationId,requestDigest:lifecycleDigest(bytes),action:command.action,tripId,status:'declined',reason:'TRIP_CAPACITY',revision:8});
test('closed commands reject implicit archive, copied content, inferred fields and duplicate Memory refs',()=>{
 for(const command of [create,archive,{...common,action:'activate',expectedHeadVersion:3},{...common,action:'reconcile',expectedHeadVersion:3,state:'retained'}])assert.equal(isLifecycleCommand(command),true);
 for(const command of [{...create,dates:['old']},{...create,confirmed:false},{...create,expectedRevision:Infinity},{...create,expectedActiveTripId:'unknown'},{...archive,preference:{action:'keep',memoryRefs:[...refs,...refs]}},{...archive,preference:{action:'keep',memoryRefs:[]}},{...archive,preference:{action:'skip',revoke:true}},{...archive,expectedHeadVersion:0},{...create,operationId:operationId.toUpperCase()},{...create,title:' X '}]){
  // Numeric-only UUID uppercasing is unchanged; exercise a UUID with alpha instead.
  if(command.operationId===operationId&&JSON.stringify(command)===JSON.stringify(create))continue;
  assert.equal(isLifecycleCommand(command),false);
 }
 assert.equal(isLifecycleCommand({...create,operationId:'ABCDEFAB-0000-4000-8000-000000000000'}),false);
 assert.equal(isLifecycleCommand({...archive,preference:{action:'skip'}}),true);
});
test('snapshot rejects invented service emptiness, invalid capacity, mixed page state and weak cursor',()=>{
 assert.equal(isLifecycleSnapshot(snapshot),true);
 const row={tripId,title:'Saved',headVersion:3,state:'legacy',archivedVersion:null,archivedAt:null};
 for(const value of [{...snapshot,serviceStatus:'none'},{...snapshot,capacity:{...capacity,draftCount:4}},{...snapshot,trips:[row]},{...snapshot,nextTripId:tripId},{...snapshot,trips:[{...row,state:'active'}]}])assert.equal(isLifecycleSnapshot(value),false);
 assert.equal(isLifecycleSnapshot({...snapshot,capacity:{...capacity,legacyCount:1},trips:[row]}),true);
 assert.equal(isLifecycleReceipt(applied(archive)),true);
 assert.equal(isLifecycleReceipt({...declined(create),reason:'NETWORK_UNKNOWN'}),false);
 assert.equal(isLifecycleRecovery({version:'trip-lifecycle/1',ownerId,sessionId,operationId,receipt:null}),true);
 assert.equal(isLifecycleRecovery({version:'trip-lifecycle/1',ownerId,sessionId,operationId,receipt:{...declined(create),sessionId:id(9)}}),false);
});
test('adapter passes original bytes, binds archive source refs and refuses fabricated success',async()=>{
 const raw=' '+JSON.stringify(archive,null,2)+'\n';let value=applied(archive,raw);const calls=[];
 const adapter=lifecycleOperations(async(...args)=>{calls.push(args);return {data:value};},async()=>({data:{ownerId,sessionId}}));
 assert.deepEqual(await adapter.mutateLifecycle(archive,raw),{data:value});assert.deepEqual(calls,[['execute',archive,raw]]);
 for(const patch of [{requestDigest:lifecycleDigest(JSON.stringify(archive))},{ownerId:id(10)},{sessionId:id(11)},{archivedVersion:2},{memoryRefs:[{...refs[0],revision:1}]}]){
  value={...applied(archive,raw),...patch};assert.deepEqual(await adapter.mutateLifecycle(archive,raw),{error:'UNAVAILABLE'});
 }
 const count=calls.length;assert.deepEqual(await adapter.mutateLifecycle(archive,JSON.stringify(create)),{error:'INVALID_INPUT'});assert.equal(calls.length,count);
});
test('terminal declined and abandon are exact receipts; unknown errors never become a decline',async()=>{
 let response={data:declined(create)},reads=0;const seen=[];
 const adapter=lifecycleOperations(async(...args)=>{seen.push(args);return response;},async()=>({data:{ownerId,sessionId}}));
 assert.deepEqual(await adapter.mutateLifecycle(create,JSON.stringify(create)),response);
 response={data:{...declined(create),reason:'USER_ABANDONED'}};assert.deepEqual(await adapter.mutateLifecycle(create,JSON.stringify(create),true),response);assert.equal(seen.at(-1)[0],'abandon');
 response={error:'UNAVAILABLE'};assert.deepEqual(await adapter.mutateLifecycle(create,JSON.stringify(create)),response);
 const drift=lifecycleOperations(async()=>({data:applied(create)}),async()=>++reads===1?{data:{ownerId,sessionId}}:{error:'SESSION_REPLACED'});
 assert.deepEqual(await drift.mutateLifecycle(create,JSON.stringify(create)),{error:'SESSION_REPLACED'});
});
test('pagination requires one stable revision and original op recovery remains nullable',async()=>{
 assert.deepEqual(lifecyclePageInput(new URLSearchParams()),{});
 assert.deepEqual(lifecyclePageInput(new URLSearchParams({afterTripId:tripId,expectedRevision:'8'})),{afterTripId:tripId,expectedRevision:8});
 for(const raw of ['afterTripId='+tripId,'afterTripId='+tripId+'&expectedRevision=08','afterTripId='+tripId+'&expectedRevision=8&extra=1','afterTripId='+tripId+'&afterTripId='+tripId+'&expectedRevision=8'])assert.equal(lifecyclePageInput(new URLSearchParams(raw)),null);
 let value=snapshot;const adapter=lifecycleOperations(async()=>({data:value}),async()=>({data:{ownerId,sessionId}}));
 assert.deepEqual(await adapter.readLifecycle({afterTripId:tripId,expectedRevision:7}),{error:'UNAVAILABLE'});
 value={version:'trip-lifecycle/1',ownerId,sessionId,operationId,receipt:null};assert.deepEqual(await adapter.recoverLifecycle(operationId),{data:value});
 value={...value,receipt:declined(create)};assert.deepEqual(await adapter.recoverLifecycle(operationId),{data:value});
});
test('fatal UTF-8 and byte limit preserve actual request hash without replacement',async()=>{
 const raw=JSON.stringify({...create,title:'下一旅程🐼'});const scope=nativeRequestScope(new AbortController().signal);
 try{
  const bytes=await lifecycleRawBody(new Request('http://localhost',{method:'POST',body:raw}),scope);assert.equal(bytes,raw);assert.deepEqual(lifecycleBody(bytes),{...create,title:'下一旅程🐼'});
  assert.equal(await lifecycleRawBody(new Request('http://localhost',{method:'POST',body:Uint8Array.from([123,34,120,34,58,34,255,34,125])}),scope),null);
  assert.equal(await lifecycleRawBody(new Request('http://localhost',{method:'POST',body:' '.repeat(32769)}),scope),null);
  assert.equal(lifecycleBody('\ufeff'+raw),null);
 }finally{scope.dispose();}
});
