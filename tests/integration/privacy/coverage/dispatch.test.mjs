import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { handleCoverage } from '../../../../lib/server/privacy/coverage/http.ts';
import { CATALOG_VERSION, MODULE_CATALOG, moduleById } from '../../../../lib/server/privacy/coverage/catalog.ts';
import { parseCoverageInput, coverageDigest } from '../../../../lib/server/privacy/coverage/contract.ts';
import { matchesCoverageResult, coverageReport } from '../../../../lib/server/privacy/coverage/consumer.ts';
import { handleCommunityJ1 } from '../../../../lib/server/community/j1-http.ts';
import { handleSafetyRequest } from '../../../../lib/server/community/safety/http.ts';
import { handlePublicationRequest } from '../../../../lib/server/community/publication/http.ts';
import { retained } from '../../../../lib/server/community/contract.ts';
import { safetyRetained } from '../../../../lib/server/community/safety/contract.ts';
import { publicationRetained } from '../../../../lib/server/community/publication/contract.ts';
const actor = { actorId:randomUUID(), sessionId:randomUUID(), mobileEpoch:1 };
const input=(moduleId,action,command,phase='execute',tripId=null,operationId=command.operationId??command.requestId??randomUUID())=>({schemaVersion:'data-coverage/1',catalogVersion:CATALOG_VERSION,...actor,moduleId,moduleVersion:moduleById(moduleId).version,operationId,action,phase,confirmed:true,tripId,commandBytes:'\t'+JSON.stringify(command)});
const request=raw=>new Request('http://localhost/api/privacy/native/v1/coverage',{method:'POST',headers:{'content-type':'application/json'},body:raw});
const call=async(value,options)=>{const raw=JSON.stringify(value),response=await handleCoverage(request(raw),options);return{raw,response,body:await response.json()};};
const authority=()=>({authenticate:async()=>actor,current:async()=>true});
const options=handlers=>({enabled:true,authority,handlers});
const protocols={ugc:'community-j1/1',safety:'community-safety-j2/1',publication:'community-publication-j3j4/1'};
const retainedFor={ugc:retained,safety:safetyRetained,publication:publicationRetained};
const scopes={ugc:'community_module',safety:'community_safety_module',publication:'community_publication_module'};

for(const moduleId of ['ugc','safety','publication'])test(`${moduleId}: real original owner HTTP command/receipt validators, same bytes unknown ACK recovery and no cross-actor completion`,async()=>{
 let bytes=null,calls=0,loseAck=true;
 const handlers={[moduleId]:async(original)=>{
   const rpc={authenticate:async()=>actor.actorId,sessionId:()=>actor.sessionId,current:async()=>true,async call(name,params){
     calls++;assert.equal(name,'community_workspace');const {command,mutationBytes,protocol}=params.p_input;assert.equal(protocol,protocols[moduleId]);
     if(command.action==='delete'){
       bytes=mutationBytes;assert.equal(command.operationId,selected.operationId);
       if(loseAck) {loseAck=false;throw Error('synthetic response lost after fixture commit');}
       return{data:{schemaVersion:protocol,kind:'deleted',actorId:actor.actorId,sessionId:actor.sessionId,operationId:command.operationId,scope:scopes[moduleId],retained:retainedFor[moduleId]},error:null};
     }
     assert.equal(command.action,'operation');assert.equal(command.mutationBytes,bytes);
     return{data:{schemaVersion:protocol,kind:'operation',actorId:actor.actorId,sessionId:actor.sessionId,operationId:command.operationId,state:'committed',...(moduleId==='ugc'?{submission:null}:moduleId==='safety'?{record:null}:{publication:null,reference:null})},error:null};
   }};
   const result=moduleId==='ugc'?await handleCommunityJ1(original,{enabled:false,cleanupEnabled:true,surface:'native',createRpc:()=>rpc}):moduleId==='safety'?await handleSafetyRequest(original,{enabled:false,cleanupEnabled:true,surface:'native',createRpc:()=>rpc}):await handlePublicationRequest(original,{enabled:false,cleanupEnabled:true,surface:'native',createRpc:()=>rpc});
   return Response.json(result.body,{status:result.status});
 }};
 const selected=input(moduleId,'delete',{action:'delete',operationId:randomUUID(),confirmed:true});
 const uncertain=await call(selected,options(handlers));assert.equal(uncertain.body.state,'unknown');assert.equal(matchesCoverageResult(uncertain.body,uncertain.raw),true);
 const recovered=await call({...selected,phase:'recover'},options(handlers));assert.equal(recovered.body.state,'scoped_complete');assert.equal(recovered.body.allUserDataCompleted,false);assert.equal(matchesCoverageResult(recovered.body,recovered.raw),true);
 assert.notEqual(uncertain.body.requestDigest,recovered.body.requestDigest);assert.equal(bytes,selected.commandBytes);assert.equal(calls,2);
 assert.equal(matchesCoverageResult({...recovered.body,actorId:randomUUID()},recovered.raw),false);
 assert.equal(matchesCoverageResult({...recovered.body,moduleVersion:'old/1'},recovered.raw),false);
 assert.equal(matchesCoverageResult({...recovered.body,allUserDataCompleted:true},recovered.raw),false);
 assert.equal(matchesCoverageResult({...recovered.body,result:{data:{...recovered.body.result.data,state:'absent'}}},recovered.raw),false);
 const report=coverageReport(actor,'delete',[{raw:recovered.raw,value:recovered.body}]);assert.equal(report.modules.length,MODULE_CATALOG.length);assert.equal(report.allUserDataCompleted,false);
 assert.equal(coverageReport({...actor,mobileEpoch:2},'delete',[{raw:recovered.raw,value:recovered.body}]).modules.find(m=>m.moduleId===moduleId).state,'unavailable');
 assert.equal(coverageReport(actor,'export',[{raw:recovered.raw,value:recovered.body}]).modules.find(m=>m.moduleId===moduleId).state,'unavailable');
});

test('closed selection prevents privilege widening; disabled/foreign/session changed denies before a handler',async()=>{
 let calls=0;const handlers={ugc:async()=>{calls++;return Response.json({});}};
 const selected=input('ugc','delete',{action:'delete',operationId:randomUUID(),confirmed:true});
 for(const changes of [{actorId:randomUUID()},{sessionId:randomUUID()},{mobileEpoch:2}])assert.equal((await call({...selected,...changes},options(handlers))).response.status,409);
 for(const changes of [{confirmed:false},{catalogVersion:'core-export-d2/1'},{moduleVersion:'old/1'},{rpc:'unrestricted'},{commandBytes:JSON.stringify({action:'submit',operationId:selected.operationId})},{commandBytes:JSON.stringify({action:'delete',operationId:randomUUID(),confirmed:true})}])assert.equal((await call({...selected,...changes},options(handlers))).response.status,400);
 assert.equal((await call(selected,{...options(handlers),enabled:false})).response.status,503);
 assert.equal((await call(selected,{...options(handlers),authority:()=>({authenticate:async()=>null,current:async()=>true})})).response.status,401);
 assert.equal((await call(selected,{...options(handlers),authority:()=>({authenticate:async()=>actor,current:async()=>false})})).response.status,401);
 assert.equal(calls,0);
 const changed=await call(selected,{...options(handlers),authority:()=>{let n=0;return{authenticate:async()=>actor,current:async()=>++n===1};}});
 assert.equal(changed.body.state,'unknown');assert.equal(changed.body.result,null);assert.equal(changed.body.reason,'SCOPE_CHANGED');
});

test('denominator includes missing server/device/external modules and accepts no client device proof',async()=>{
 const selected=input('order_references','export',{});
 const result=await call(selected,options({}));assert.equal(result.body.state,'unavailable');assert.equal(result.body.reason,'EXPORT_DELETE_NOT_IMPLEMENTED');
 assert.equal(matchesCoverageResult({...result.body,state:'scoped_complete'},result.raw),false);
 for(const id of ['materials','app_group','offline','external_copies'])assert.equal(parseCoverageInput(input(id,'delete',{})),null);
 const response=await handleCoverage(new Request('http://localhost/api/privacy/native/v1/coverage'),options({}));const catalog=await response.json();
 assert.equal(catalog.modules.length,MODULE_CATALOG.length);assert.equal(new Set(catalog.modules.map(m=>m.id)).size,catalog.modules.length);
 for(const id of ['trip','memory','brief','case','ugc','safety','publication','notifications','entitlements','order_references','local_share','app_group','guide','archive','offline'])assert.ok(catalog.modules.some(m=>m.id===id));
});

test('core queued and ready_complete cannot be promoted to delivered all-data export',async()=>{
 const selected=input('trip','export',{requestId:randomUUID(),confirmed:true});const now=new Date().toISOString();
 const job={kind:'privacy_export_job/1',requestId:selected.operationId,scope:'core-export-d2/1',state:'queued',generation:1,createdAt:now,completedAt:null,artifactDigest:null,artifactBytes:null,artifactExpiresAt:null,modules:[],allUserDataCompleted:false};
 const result=await call(selected,options({core:async()=>Response.json(job,{status:202})}));assert.equal(result.body.state,'queued');assert.equal(matchesCoverageResult(result.body,result.raw),true);
 const ready={...job,state:'ready_complete',completedAt:now,artifactDigest:'a'.repeat(64),artifactBytes:20,artifactExpiresAt:new Date(Date.now()+10000).toISOString(),modules:['trip','conversations','results','profile','memory','turn','user_artifact','brief','entitlements'].map(module=>({module,status:'complete',reason:'NONE',pages:1,rows:0,digest:'b'.repeat(64)}))};
 const completed=await call({...selected,phase:'recover'},options({core:async()=>Response.json(ready)}));assert.equal(completed.body.state,'partial');assert.equal(completed.body.reason,'PROTECTED_DOWNLOAD_REQUIRED');
 assert.equal(matchesCoverageResult({...completed.body,state:'scoped_complete',reason:'NONE'},completed.raw),false);
 assert.equal(matchesCoverageResult({...completed.body,catalogVersion:'old'},completed.raw),false);
});

test('Case and Brief invoke existing bounded owner bundle double-read; changed source and stale TTL never complete',async()=>{
 const {handleServiceData}=await import('../../../../lib/server/service-cases/operations/data-http.ts');
 const {handleTravelerBrief}=await import('../../../../lib/server/service-cases/brief/http.ts');
 for(const moduleId of ['case','brief']){
  const selected=input(moduleId,'export',{action:'export',requestId:randomUUID(),confirmed:true});let changed=false,calls=0;
  const handlers={[moduleId]:async original=>{
   const rpc={authenticate:async()=>actor.actorId,sessionId:()=>actor.sessionId,call:async(name,params)=>{
    calls++;assert.equal(name,moduleId==='case'?'service_case_data_v1':'service_case_brief_v1');assert.equal(params.p_input.requestId,selected.operationId);
    const capturedAt=Date.now(),coverage=moduleId==='case'?{case:'complete',grant_audit:'complete',service:'complete',minutes:'complete',service_audit:'complete',operation:'complete',brief:'unavailable',attachments:'unavailable'}:{brief:'complete',previews:'complete',audit:'complete',operations:'complete',sourceValues:'not_copied',attachments:'unavailable'};
    return{data:{schemaVersion:moduleId==='case'?'service-case-data/1':'traveler-brief-data/1',kind:'bundle',requestId:selected.operationId,ownerId:actor.actorId,sessionId:actor.sessionId,capturedAt,expiresAt:capturedAt+30000,sourceDigest:(changed&&calls%2===0?'b':'a').repeat(64),corePackageEnrollment:'not_enrolled',allUserDataCompleted:false,coverage,rows:[]},error:null};
   }};
   const result=moduleId==='case'?await handleServiceData(original,{enabled:true,createRpc:()=>rpc}):await handleTravelerBrief(original,{enabled:true,surface:'owner',createRpc:()=>rpc});return Response.json(result.body,{status:result.status});
  }};
  const exported=await call(selected,options(handlers));assert.equal(exported.body.state,'scoped_complete',JSON.stringify(exported.body));assert.equal(calls,2);assert.equal(matchesCoverageResult(exported.body,exported.raw),true);
  assert.equal(matchesCoverageResult(exported.body,exported.raw,Date.now()+31000),false);
  changed=true;const stale=await call(selected,options(handlers));assert.equal(stale.body.state,'unavailable');assert.equal(stale.body.result,null);assert.equal(calls,4);
 }
});

test('Case/Brief recovered delete receipt must match original exact bytes, current grant and explicit scope',async()=>{
 for(const moduleId of ['case','brief']){
  const command={action:'delete',operationId:randomUUID(),caseId:randomUUID(),grantRevision:2,confirmed:true,...(moduleId==='brief'?{recipientId:randomUUID(),expectedRevision:3}:{})};
  const selected=input(moduleId,'delete',command,'recover');
  const receipt={schemaVersion:moduleId==='case'?'service-case-data/1':'traveler-brief/1',kind:'receipt',operationId:selected.operationId,requestDigest:coverageDigest(selected.commandBytes),outcome:moduleId==='case'?'deleted':'applied',createdAt:Date.now(),...(moduleId==='case'?{allUserDataCompleted:false}:{action:'delete',caseId:command.caseId,revision:4,grantRevision:2})};
  const handlers={[moduleId]:async original=>{assert.deepEqual(await original.json(),{action:'read_operation',operationId:selected.operationId});return Response.json({data:{receipt}});}};
  const recovered=await call(selected,options(handlers));assert.equal(recovered.body.state,'scoped_complete');assert.equal(matchesCoverageResult(recovered.body,recovered.raw),true);
  const changed={...selected,commandBytes:JSON.stringify({...command,grantRevision:3})};const wrong=await call(changed,options(handlers));assert.equal(wrong.body.state,'unknown');assert.equal(wrong.body.result,null);
  const absent=await call(selected,options({[moduleId]:async()=>Response.json({data:{receipt:null}})}));assert.equal(absent.body.state,'unknown');assert.equal(absent.body.reason,'ORIGINAL_ACK_ABSENT');
  assert.equal(matchesCoverageResult({...absent.body,state:'scoped_complete',reason:'NONE'},absent.raw),false);
 }
});

test('Guide selected exact Trip/reference-only handler, no unjournaled automatic destructive recovery',async()=>{
 const {runGuide}=await import('../../../../lib/server/guide/service.ts');const tripId=randomUUID(),reference=randomUUID();
 const selected=input('guide','delete',{action:'forget',operationId:randomUUID(),expectedTripVersion:4,placeReferenceId:reference,locale:'en',interest:'general'},'execute',tripId);
 const result=await call(selected,options({guide:async(original,selection)=>{
  assert.equal(new URL(original.url).pathname,`/api/guide/native/v1/trips/${tripId}`);const command=await original.json();
  const outcome=await runGuide(selection.input.tripId,command,{current:async()=>true,now:Date.now,rpc:async(name,params)=>{assert.equal(name,'guide_place_v1');assert.equal(params.p_trip,tripId);assert.equal(params.p_input.placeReferenceId,reference);return{data:{kind:'forgotten',operationId:selected.operationId},error:null};}});
  return Response.json({data:outcome});
 }}));assert.equal(result.body.state,'scoped_complete');assert.equal(matchesCoverageResult(result.body,result.raw),true);
 assert.equal(parseCoverageInput({...selected,phase:'recover'}),null,'original Guide forget has no durable operation receipt; repeated delete is not recovery');
});

test('Trip queued is not complete; selected Trip and original operation stay bound across GET recovery',async()=>{
 const tripId=randomUUID(),selected=input('trip','delete',{requestId:randomUUID(),tripId,expectedVersion:1,confirmed:true},'execute',tripId),now=new Date().toISOString();
 const receipt={version:1,requestId:selected.operationId,tripId,scope:'trip-core-v1',state:'queued',requestedAt:now,completedAt:null,allUserDataCompleted:false,backupErasure:'not_verified',providerErasure:'not_performed',offlineRevocation:'on_reconnect_only',exportedFilesRevocable:false};
 const queued=await call(selected,options({trip:async original=>{assert.equal(original.method,'POST');assert.deepEqual(await original.json(),JSON.parse(selected.commandBytes));return Response.json(receipt,{status:202});}}));
 assert.equal(queued.body.state,'queued');assert.equal(matchesCoverageResult({...queued.body,state:'scoped_complete',reason:'NONE'},queued.raw),false);
 receipt.state='completed';receipt.completedAt=now;
 const recovered=await call({...selected,phase:'recover'},options({trip:async original=>{assert.equal(original.method,'GET');assert.equal(new URL(original.url).searchParams.get('requestId'),selected.operationId);return Response.json(receipt);}}));assert.equal(recovered.body.state,'scoped_complete');
 const foreign=await call({...selected,phase:'recover'},options({trip:async()=>Response.json({...receipt,tripId:randomUUID()})}));assert.equal(foreign.body.state,'unknown');assert.equal(foreign.body.result,null);
 const inconsistent=await call({...selected,phase:'recover'},options({trip:async()=>Response.json({...receipt,completedAt:'2020-01-01T00:00:00.000Z'})}));assert.equal(inconsistent.body.state,'unknown');
});

test('linked Trip exact selected arrays compare semantically across JSONB object ordering, never widen the scope',async()=>{
 const tripId=randomUUID(),arrays={threadIds:[],turnIds:[],taskIds:[],goalIds:[],messageIds:[],artifactIds:[],exportRequestIds:[]};
 const selected=input('trip','delete',{action:'confirm',requestId:randomUUID(),planId:randomUUID(),scopeDigest:'a'.repeat(64),expectedVersion:1,confirmed:true,selection:arrays},'execute',tripId),now=new Date().toISOString();
 const command=JSON.parse(selected.commandBytes),retained=['FINANCIAL_LEDGER_MINIMUM','TASK_CAPACITY_MINIMUM','EXTERNAL_DOWNLOADED_COPIES','PROVIDER_COPIES_NOT_ERASED','BACKUP_ERASURE_NOT_VERIFIED'];
 const receipt={kind:'linked_trip_delete_receipt/1',requestId:selected.operationId,planId:command.planId,tripId,scope:'trip-linked-chat-d3/1',scopeDigest:command.scopeDigest,state:'completed',requestedAt:now,completedAt:now,selection:Object.fromEntries(Object.entries(arrays).reverse()),erasedCounts:Object.fromEntries(['threads','turns','goals','messages','artifacts','textBodies','groundedRows','planningRows','consumerReferences','exports','tickets'].map(k=>[k,0])),allUserDataCompleted:false,retained};
 const result=await call(selected,options({linked_trip:async()=>Response.json(receipt)}));assert.equal(result.body.state,'scoped_complete');assert.equal(matchesCoverageResult(result.body,result.raw),true);
 const wrong=await call(selected,options({linked_trip:async()=>Response.json({...receipt,selection:{...arrays,threadIds:[randomUUID()]}})}));assert.equal(wrong.body.state,'unknown');
});

test('known cancellation is terminal ACK only; tampered outer complete cannot erase its partial result',async()=>{
 const selected=input('publication','delete',{action:'delete',operationId:randomUUID(),confirmed:true},'recover');
 const body={data:{schemaVersion:'community-publication-j3j4/1',kind:'operation',actorId:actor.actorId,sessionId:actor.sessionId,operationId:selected.operationId,state:'abandoned',publication:null,reference:null}};
 const result=await call(selected,options({publication:async()=>Response.json(body)}));assert.equal(result.body.state,'partial');assert.equal(result.body.reason,'ORIGINAL_OPERATION_CANCELLED');assert.equal(matchesCoverageResult(result.body,result.raw),true);
 assert.equal(matchesCoverageResult({...result.body,state:'scoped_complete',reason:'NONE'},result.raw),false);
});
