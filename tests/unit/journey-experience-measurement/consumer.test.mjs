import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { SCHEMA, PURPOSE, NOTICE, TTL, CAPABILITIES, parseCommand } from '../../../lib/server/journey-entry/experience-measurement/contract.ts';
import { decode, COUNTERS, rates } from '../../../lib/server/journey-entry/experience-measurement/protocol.ts';
import { handleMeasurement, measurementNativeHTTP } from '../../../lib/server/journey-entry/experience-measurement/http.ts';
import { validMeasurementMetadata, measurementProfileExportHandler } from '../../../lib/server/privacy/experience-measurement/export.ts';
import { purgeMeasurement, measurementRestoreAllowed } from '../../../lib/server/privacy/experience-measurement/retention.ts';
import { exportCanonical, collectCoreExport, CORE_EXPORT_MODULES } from '../../../lib/server/privacy/export-dispatcher.ts';
import { encryptExportArtifact, decryptExportArtifact } from '../../../lib/server/privacy/export-artifact.ts';
import { parseClosedJSON } from '../../../lib/server/journey-entry/experience-measurement/json.ts';
import { validMeasurementCoverageSelection, measurementCoverageRequestBody, measurementCoverageOutcome } from '../../../lib/server/privacy/experience-measurement/coverage.ts';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const now = 1791780000000;
const actor = {ownerId:id(1),sessionId:id(2),mobileEpoch:3};
const input = extra => ({schemaVersion:SCHEMA,purpose:PURPOSE,...extra});
const output = extra => ({...input({}),...actor,...extra});
const source = {kind:'service_task',id:id(4),revision:null};
const receive = () => input({action:'receive',consentId:id(5),admissionId:id(6),reportId:id(7),entry:'e1',source,
  signal:{kind:'presented',artifact:{id:id(8),revision:1},outcome:'partial'},clock:{kind:'unknown'}});
const ack = () => output({kind:'received',reportId:id(7),admissionId:id(6),consentId:id(5),state:'recorded',receivedAt:now-1000,expiresAt:now-1000+TTL,reused:false});
const req = value => new Request('http://localhost/api/chat/native/v5/experience-measurement',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});
const options = (rpc, changes={}) => ({enabled:true,now:()=>now,authority:()=>({authenticate:async()=>actor,current:async()=>true,rpc,...changes})});

test('strict JSON rejects duplicate/escaped aliases and hidden overwritten raw values before dispatch',async()=>{
  for(const bytes of ['{"action":"raw private body","action":"policy"}','{"a":1,"\\u0061":2}','{"a":[{"x":1,"x":2}]}','[01]','{"x":1,}'])assert.throws(()=>parseClosedJSON(bytes));
  assert.deepEqual(JSON.parse(JSON.stringify(parseClosedJSON('{"escaped":"a\\"b","values":[true,false,null,1.25,-2e3]}'))),{escaped:'a"b',values:[true,false,null,1.25,-2000]});
  const raw=JSON.stringify(receive()).replace('"purpose":','"purpose":"raw hidden content","purpose":');let calls=0;
  const request=new Request('http://localhost',{method:'POST',headers:{'content-type':'application/json'},body:raw});
  const response=await handleMeasurement(request,options(async()=>{calls++;return ack();}));assert.equal(response.status,400);assert.equal(calls,0);
  const invalid=receive();invalid.reportId='00000000-0000-6000-0000-000000000000';assert.equal(parseCommand(invalid),null);
});

test('closed input rejects actor, raw payloads, activation claims, client receipts and wrong entry source',()=>{
  assert.ok(parseCommand(receive()));
  for(const key of ['actorId','rawGoal','freeText','activated','errorBody','trace','contentDigest']) assert.equal(parseCommand({...receive(),[key]:'private'}),null);
  assert.equal(parseCommand({...receive(),signal:{kind:'activated',value:true}}),null);
  assert.equal(parseCommand({...receive(),entry:'e2'}),null);
  assert.equal(parseCommand({...receive(),signal:{kind:'writer',writer:'directions_saved',operationId:id(9),artifact:{id:id(8),revision:2},receipt:{reused:true}}}),null);
});
test('new notice is mandatory and opt-in selection is nonempty sorted unique',()=>{
  const c=input({action:'consent',operationId:id(10),noticeVersion:NOTICE,entries:['e1','e2']});assert.ok(parseCommand(c));
  for(const entries of [[],['e1','e1'],['e2','e1'],['marketing']])assert.equal(parseCommand({...c,entries}),null);
  assert.equal(parseCommand({...c,noticeVersion:'existing-planning-policy'}),null);
});
test('clock preserves unknown, bounds duration and requires process provenance',()=>{
  const c=receive();assert.ok(parseCommand(c));
  assert.ok(parseCommand({...c,clock:{kind:'local_elapsed',processId:id(11),elapsedMs:200}}));
  for(const clock of [{kind:'local_elapsed',elapsedMs:200},{kind:'local_elapsed',processId:id(11),elapsedMs:-1},{kind:'unknown',receivedAt:now}])assert.equal(parseCommand({...c,clock}),null);
});
test('pre-result tickets admit Trip-local PDF/OCR and Goal reads without a successful result pointer',()=>{
  const make=(entry,source,clockOrigin={kind:'unknown'})=>input({action:'admit',operationId:id(40),consentId:id(5),entry,source,clockOrigin});
  const trip={kind:'native_entry',logicalId:id(41),entry:'e2',anchor:{kind:'trip',tripId:id(42),tripVersion:0,medium:'pdf'}};
  assert.ok(parseCommand(make('e2',trip)));assert.ok(parseCommand(make('e2',{...trip,anchor:{...trip.anchor,medium:'screenshot'}})));
  const goal={kind:'native_entry',logicalId:id(43),entry:'e3',anchor:{kind:'goal',conversationId:id(44),goalId:id(43),goalVersion:2,parentMessageId:id(45),inputSequence:7}};
  assert.ok(parseCommand(make('e3',goal,{kind:'native_monotonic',processId:id(46)})));
  assert.equal(parseCommand(make('e3',{...goal,logicalId:id(99)})),null);
  assert.equal(parseCommand(make('e2',{...trip,anchor:{kind:'local_import'}})),null);
  assert.equal(parseCommand(make('e2',{kind:'material_operation',id:id(41),revision:1})),null);
  assert.equal(parseCommand(make('e3',{kind:'goal_read',id:id(43),revision:2})),null);
  assert.ok(parseCommand({...receive(),entry:'e2',source:trip,signal:{kind:'terminal',outcome:'technical_failure'}}));
});
test('native ticket ACK explicitly proves authenticated acceptance-report receipt and never goal-created latency',()=>{
  const s={kind:'native_entry',logicalId:id(43),entry:'e3',anchor:{kind:'goal',conversationId:id(44),goalId:id(43),goalVersion:2,parentMessageId:id(45),inputSequence:7}};
  const command=parseCommand(input({action:'admit',operationId:id(40),consentId:id(5),entry:'e3',source:s,clockOrigin:{kind:'native_monotonic',processId:id(46)}}));
  const v=output({kind:'admission',operationId:id(40),consentId:id(5),admissionId:id(47),entry:'e3',source:s,clockOrigin:command.clockOrigin,
    authority:'authenticated_native_acceptance_report',admittedAt:null,receivedAt:now-100,expiresAt:now+1000,firstEver:'unknown',reused:false});
  assert.ok(decode(v,command,actor,now));assert.equal(decode({...v,admittedAt:now-1000},command,actor,now),null);
  assert.equal(decode({...v,authority:'service_task'},command,actor,now),null);
  assert.equal(decode({...v,clockOrigin:{kind:'native_monotonic',processId:id(99)}},command,actor,now),null);
});
test('native aggregate labels missing local-intention coverage explicitly and unknown first-ever cannot inflate first value',()=>{
  const command=parseCommand(input({action:'aggregate',consentId:id(5),entry:'e2'}));const counts=Object.fromEntries(COUNTERS.map(k=>[k,0]));
  Object.assign(counts,{allTasks:2,availableTasks:1,uncompletedTasks:2,unobservableTasks:1,unknownFirstEverTasks:2,unknownTimeTasks:2});
  const v=output({kind:'aggregate',consentId:id(5),entry:'e2',capturedAt:now,expiresAt:now+20000,sample:'authenticated_native_acceptance_reports',coverage:'local_intentions_unknown',counts});
  assert.ok(decode(v,command,actor,now));assert.equal(decode({...v,coverage:'original_authorities'},command,actor,now),null);
  assert.equal(decode({...v,counts:{...counts,firstValueTasks:1}},command,actor,now),null);
});
test('all tasks remain denominator including failed, unfinished and unobservable; zero denominator is unknown',()=>{
  const c=Object.fromEntries(COUNTERS.map(k=>[k,0]));Object.assign(c,{allTasks:10,availableTasks:3,firstValueTasks:2,activatedTasks:1,
    presentedOpportunities:4,declinedOpportunities:1,technicalFailures:2,uncompletedTasks:5,unobservableTasks:2,unknownTimeTasks:8,repeatQuestions:1,judgableQuestions:4});
  assert.deepEqual(rates(c),{firstValue:.2,activationAvailable:1/3,activationAll:.1,decline:.25,repeatedQuestions:.25});
  assert.equal(rates(Object.fromEntries(COUNTERS.map(k=>[k,0]))).firstValue,null);
  const command=parseCommand(input({action:'aggregate',consentId:id(5),entry:'e1'}));
  const v=output({kind:'aggregate',consentId:id(5),entry:'e1',capturedAt:now,expiresAt:now+20000,sample:'qualified_original_service_tasks',coverage:'original_authorities',counts:c});
  assert.ok(decode(v,command,actor,now));
  assert.equal(decode({...v,counts:{...c,firstValueTasks:11}},command,actor,now),null);
  assert.equal(decode({...v,sample:'successful_results'},command,actor,now),null);
});
test('default off refuses before authentication/RPC and actual native route is unavailable without configuration',async()=>{
  let calls=0;const res=await handleMeasurement(req(receive()),{...options(async()=>{calls++;}),enabled:false});assert.equal(res.status,503);assert.equal(calls,0);
  const native=await measurementNativeHTTP(req(receive()));assert.equal(native.status,503);assert.match(native.headers.get('cache-control'),/no-store/);
});
test('authenticated HTTP passes exact metadata bytes once to protected port and rechecks actor',async()=>{
  let calls=0,current=0;const c=receive();const res=await handleMeasurement(req(c),options(async(action,bytes)=>{calls++;assert.equal(action,'receive');assert.deepEqual(JSON.parse(bytes),c);return ack();},
    {current:async()=>{current++;return true;}}));assert.equal(res.status,200);assert.equal(calls,1);assert.equal(current,2);assert.deepEqual((await res.json()).data,ack());
});
test('foreign/stale/expired reply and replaced actor after mutation produce unknown ACK without retry',async()=>{
  for(const mutate of [v=>({...v,ownerId:id(99)}),v=>({...v,mobileEpoch:4}),v=>({...v,expiresAt:now}),v=>({...v,rawText:'private'})]){
    let calls=0;const res=await handleMeasurement(req(receive()),options(async()=>{calls++;return mutate(ack());}));assert.equal(res.status,503);assert.equal((await res.json()).error.code,'MEASUREMENT_ACK_UNKNOWN');assert.equal(calls,1);
  }
  let checks=0;const res=await handleMeasurement(req(receive()),options(async()=>ack(),{current:async()=>++checks===1}));assert.equal((await res.json()).error.code,'MEASUREMENT_ACK_UNKNOWN');
});
test('known SQL consent/source denials remain closed; raw errors are never reflected and no retry',async()=>{
  for(const [error,status,code] of [['CONSENT_REQUIRED',403,'CONSENT_REQUIRED'],['MEASUREMENT_SOURCE_CHANGED',409,'MEASUREMENT_SOURCE_CHANGED'],['raw private error',503,'MEASUREMENT_ACK_UNKNOWN']]){
    let calls=0;const res=await handleMeasurement(req(receive()),options(async()=>{calls++;throw Error(error);}));assert.equal(res.status,status);assert.equal((await res.json()).error.code,code);assert.equal(calls,1);
  }
});
test('erase recovery retains original exact bytes and refuses another operation or arbitrary payload',()=>{
  const erase=input({action:'erase',operationId:id(12),sourceDigest:'a'.repeat(64),previewDigest:'b'.repeat(64)});
  const c=input({action:'recover',operationId:id(12),mutationBytes:JSON.stringify(erase)});assert.ok(parseCommand(c));
  assert.equal(parseCommand({...c,operationId:id(13)}),null);assert.equal(parseCommand({...c,mutationBytes:JSON.stringify(receive())}),null);
});
test('erasure success is bound to exact original metadata bytes and bounded receipt expiry',()=>{
  const c=parseCommand(input({action:'erase',operationId:id(12),sourceDigest:'a'.repeat(64),previewDigest:'b'.repeat(64)}));
  const digest=createHash('sha256').update(JSON.stringify(c)).digest('hex');
  const v=output({kind:'erasure',operationId:id(12),requestDigest:digest,decidedAt:now-1,expiresAt:now+1000,scope:SCHEMA,state:'erased',
    erasedRows:3,consentRevoked:true,fenceRecorded:true,allUserDataCompleted:false});
  assert.ok(decode(v,c,actor,now,digest));assert.equal(decode(v,c,actor,now,'f'.repeat(64)),null);assert.equal(decode({...v,expiresAt:now},c,actor,now,digest),null);
});
test('coverage helper binds distinct measurement domain and exact erase recovery without claiming whole-account completion',()=>{
  const c=input({action:'erase',operationId:id(12),sourceDigest:'a'.repeat(64),previewDigest:'b'.repeat(64)});const bytes=JSON.stringify(c);
  const selection={moduleId:'journey_measurement',moduleVersion:SCHEMA,action:'delete',phase:'recover',tripId:null,operationId:id(12),
    actorId:actor.ownerId,sessionId:actor.sessionId,mobileEpoch:3,commandBytes:bytes};
  assert.ok(validMeasurementCoverageSelection(selection,c));assert.equal(validMeasurementCoverageSelection({...selection,moduleId:'profile'},c),false);
  const recovered=JSON.parse(measurementCoverageRequestBody(selection));assert.equal(recovered.mutationBytes,bytes);assert.equal(recovered.operationId,id(12));
  const digest=createHash('sha256').update(bytes).digest('hex');const v=output({kind:'erasure',operationId:id(12),requestDigest:digest,decidedAt:now-1,expiresAt:now+1000,
    scope:SCHEMA,state:'erased',erasedRows:3,consentRevoked:true,fenceRecorded:true,allUserDataCompleted:false});
  assert.equal(measurementCoverageOutcome({input:selection,command:c,handler:'journey_measurement'},v,now).state,'scoped_complete');
  assert.equal(measurementCoverageOutcome({input:selection,command:c,handler:'journey_measurement'},{...v,ownerId:id(99)},now),null);
});
const iso=n=>new Date(n).toISOString();
const metadata = () => ({schemaVersion:SCHEMA,ownerId:actor.ownerId,consents:[{owner_id:actor.ownerId,consent_id:id(5),operation_id:id(15),session_id:actor.sessionId,mobile_epoch:3,notice_version:NOTICE,entries:['e1'],accepted_at:iso(now-1000),expires_at:iso(now-1000+TTL),revoked_at:null}],
  admissions:[{owner_id:actor.ownerId,admission_id:id(6),consent_id:id(5),entry:'e1',source_kind:'service_task',source_id:source.id,source_revision:null,task_id:source.id,goal_id:null,accepted_at:iso(now-950),received_at:iso(now-900),expires_at:iso(now-1000+TTL),session_id:actor.sessionId,mobile_epoch:3,first_ever:'unknown'}],
  reports:[{owner_id:actor.ownerId,report_id:id(7),admission_id:id(6),signal:receive().signal,clock:{kind:'unknown'},received_at:iso(now-800),expires_at:iso(now-1000+TTL)}],erasureReceipts:[],sourceRows:{consents:1,admissions:1,reports:1,erasureReceipts:0}});
const exportPage = () => {const m=metadata();const item={ownerId:actor.ownerId,profile:null,watermark:null,operations:[],sourceRows:{profiles:0,watermarks:0,operations:0,measurement:m.sourceRows},journeyMeasurement:m};
  return {schemaVersion:'profile-core-export/1',section:'snapshot',sourceDigest:createHash('sha256').update(exportCanonical({snapshot:[item]})).digest('hex'),items:[item],hasMore:false,nextCursor:null,sectionComplete:true};};
const lease=()=>({requestId:id(20),ownerId:actor.ownerId,leaseId:id(21),generation:1,expiresAt:new Date(Date.now()+60000).toISOString()});
test('typed D2 metadata verifies actual rows, relationships, notice, order and bounded expiry',()=>{
  assert.ok(validMeasurementMetadata(metadata(),now));
  for(const mutate of [m=>m.sourceRows.reports++,m=>m.reports[0].admission_id=id(99),m=>m.consents[0].notice_version='old',m=>m.reports[0].expires_at=iso(now+TTL+1),m=>m.admissions[0].rawText='private',m=>m.reports.push(m.reports[0]),m=>m.ownerId=id(99),m=>m.reports[0].owner_id=id(99)]){const m=metadata();mutate(m);assert.equal(validMeasurementMetadata(m,now),false);}
});
test('Profile suffix exports through original nine-module D2 and encrypted artifact, counters count snapshot once',async()=>{
  const own=lease();const profile=measurementProfileExportHandler(own,async()=>exportPage(),()=>now);const handlers=Object.fromEntries(CORE_EXPORT_MODULES.map(k=>[k,{sections:['snapshot'],consistency:'snapshot',page:async()=>({items:[],hasMore:false,nextCursor:null,sectionComplete:true})}]));handlers.profile=profile;
  const bundle=await collectCoreExport(own,handlers,{enabled:true,maxPages:100,maxBytes:8388608,pageSize:100},async()=>true,new AbortController().signal);
  assert.ok(bundle);assert.equal(bundle.modules.length,9);assert.ok(profile.matchesReceipt(bundle.modules.find(m=>m.module==='profile')));assert.deepEqual(bundle.data.profile.snapshot[0].sourceRows.measurement,{consents:1,admissions:1,reports:1,erasureReceipts:0});
  const key={keyId:'synthetic-only',key:Buffer.alloc(32,1)};const encrypted=encryptExportArtifact(bundle,own,key,new Date(Date.now()+60000).toISOString());assert.ok(encrypted);
  assert.ok(decryptExportArtifact(encrypted,own,key));
});
test('Profile full digest/sourceRows/unknown arm/stale data fail closed and repeated page cannot change',async()=>{
  for(const mutate of [v=>v.items[0].sourceRows.measurement={...v.items[0].sourceRows.measurement,reports:4},v=>v.items[0].journeyMeasurement.rawText='private',v=>v.items[0].journeyMeasurement.consents[0].expires_at=iso(now),v=>v.sourceDigest='0'.repeat(64)]){
    const v=exportPage();mutate(v);const h=measurementProfileExportHandler(lease(),async()=>v,()=>now);await assert.rejects(h.page('snapshot',null,100,new AbortController().signal));
  }
  let n=0;const h=measurementProfileExportHandler(lease(),async()=>{const v=exportPage();if(n++)v.items[0].journeyMeasurement.admissions[0].accepted_at=iso(now-960);return v;},()=>now);await h.page('snapshot',null,100,new AbortController().signal);await assert.rejects(h.page('snapshot',null,100,new AbortController().signal));
});
test('original Profile schema remains exact and cannot claim an absent measurement suffix',async()=>{
  const v=exportPage();v.schemaVersion='profile-core-export/1';delete v.items[0].journeyMeasurement;delete v.items[0].sourceRows.measurement;
  v.sourceDigest=createHash('sha256').update(exportCanonical({snapshot:v.items})).digest('hex');
  const h=measurementProfileExportHandler(lease(),async()=>v,()=>now);const p=await h.page('snapshot',null,100,new AbortController().signal);
  assert.equal(Object.hasOwn(p.items[0],'journeyMeasurement'),false);
});
test('SQL initial typed suffix uses exact journeyMeasurement owner/count-object and rejects aliases/unknown ticket columns',async()=>{
  const page=exportPage();page.schemaVersion='profile-core-export/1';const h=measurementProfileExportHandler(lease(),async()=>page,()=>now);
  const result=await h.page('snapshot',null,100,new AbortController().signal);assert.deepEqual(result.items,page.items);
  const wrong=metadata();wrong.admissions[0].clock_origin={kind:'unknown'};assert.equal(validMeasurementMetadata(wrong,now),false);
  const alias=exportPage();alias.items[0].measurement=alias.items[0].journeyMeasurement;delete alias.items[0].journeyMeasurement;
  const bad=measurementProfileExportHandler(lease(),async()=>alias,()=>now);await assert.rejects(bad.page('snapshot',null,100,new AbortController().signal));
});
const purgePolicy={enabled:true,schemaVersion:SCHEMA,maxBatches:2,batchSize:100,maxRunMs:1000};
test('controlled purge performs bounded physical-delete RPC and rejects no-progress/malformed/unavailable ACK',async()=>{
  let calls=0;const rpc=async()=>({...input({}),kind:'purged',erasedRows:++calls===1?100:3,hasMore:calls===1});
  assert.deepEqual(await purgeMeasurement(purgePolicy,rpc,new AbortController().signal),{state:'caught_up',batches:2,erasedRows:103});
  assert.deepEqual(await purgeMeasurement(null,rpc,new AbortController().signal),{state:'disabled',batches:0,erasedRows:0});
  assert.equal((await purgeMeasurement(purgePolicy,async()=>({...input({}),kind:'purged',erasedRows:0,hasMore:true}),new AbortController().signal)).state,'unknown');
  assert.equal((await purgeMeasurement(purgePolicy,async()=>{throw Error('private');},new AbortController().signal)).state,'unknown');
  assert.equal((await purgeMeasurement(purgePolicy,async()=>({...input({}),kind:'purged',erasedRows:100,hasMore:true}),new AbortController().signal)).state,'bounded');
});
test('restore defaults deny and accepts only independent live journal with latest SQL floor/layout agreement',async()=>{
  let calls=0;const journal={ownerId:actor.ownerId,journalId:id(30),floor:3,sourceLayoutDigest:'c'.repeat(64),capturedAt:now-1,expiresAt:now+1000};
  const rpc=async()=>{calls++;return {...input({}),kind:'restore_check',ownerId:journal.ownerId,journalId:journal.journalId,floor:3,sourceLayoutDigest:journal.sourceLayoutDigest,allowed:true};};
  assert.equal(await measurementRestoreAllowed(null,rpc,new AbortController().signal,now),false);assert.equal(calls,0);
  assert.equal(await measurementRestoreAllowed(journal,rpc,new AbortController().signal,now),true);
  assert.equal(await measurementRestoreAllowed({...journal,floor:2},rpc,new AbortController().signal,now),false);
  assert.equal(await measurementRestoreAllowed({...journal,expiresAt:now},rpc,new AbortController().signal,now),false);
});
